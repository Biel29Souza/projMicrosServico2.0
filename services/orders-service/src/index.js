import express from 'express';
import morgan from 'morgan';
import fetch from 'node-fetch';
import { PrismaClient } from '@prisma/client'; // prisma
//import { nanoid } from 'nanoid';
import { createChannel } from './amqp.js';
import { ROUTING_KEYS } from '../common/events.js';

const app = express();
app.use(express.json());
app.use(morgan('dev'));

const prisma = new PrismaClient(); // prisma

const PORT = process.env.PORT || 3002;
const USERS_BASE_URL = process.env.USERS_BASE_URL || 'http://localhost:3001';
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 2000);
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = process.env.EXCHANGE || 'app.topic';
const QUEUE = process.env.QUEUE || 'orders.q';
const ROUTING_KEY_USER_CREATED = process.env.ROUTING_KEY_USER_CREATED || ROUTING_KEYS.USER_CREATED;
const ROUTING_KEY_ORDER_CANCELLED = ROUTING_KEYS.ORDER_CANCELLED || 'order.cancelled'; // o-cancel


// In-memory "DB"
// const orders = new Map();
// In-memory cache de usuários (preenchido por eventos)
const userCache = new Map();

let amqp = null;
(async () => {
  try {
    amqp = await createChannel(RABBITMQ_URL, EXCHANGE);
    console.log('[orders] AMQP connected');

    // Bind de fila para consumir eventos user.created
    await amqp.ch.assertQueue(QUEUE, { durable: true });
    await amqp.ch.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY_USER_CREATED);

    amqp.ch.consume(QUEUE, msg => {
      if (!msg) return;
      try {
        const user = JSON.parse(msg.content.toString());
        // idempotência simples: atualiza/define
        userCache.set(user.id, user);
        console.log('[orders] consumed event user.created -> cached', user.id);
        amqp.ch.ack(msg);
      } catch (err) {
        console.error('[orders] consume error:', err.message);
        amqp.ch.nack(msg, false, false); // descarta em caso de erro de parsing (aula: discutir DLQ)
      }
    });
  } catch (err) {
    console.error('[orders] AMQP connection failed:', err.message);
  }
})();

app.get('/health', (req, res) => res.json({ ok: true, service: 'orders' }));

app.get('/', async (req, res) => {  // prisma
  const orders = await prisma.order.findMany(); // prisma
  res.json(orders); // prisma
});

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

app.post('/', async (req, res) => {
  const { userId, items, total } = req.body || {};
  if (!userId || !Array.isArray(items) || typeof total !== 'number') {
    return res.status(400).json({ error: 'userId, items[], total<number> são obrigatórios' });
  }

  // 1) Validação síncrona (HTTP) no Users Service
  try {
    const resp = await fetchWithTimeout(`${USERS_BASE_URL}/${userId}`, HTTP_TIMEOUT_MS);
    if (!resp.ok) return res.status(400).json({ error: 'usuário inválido' });
  } catch (err) {
    console.warn('[orders] users-service timeout/failure, tentando cache...', err.message);
    // fallback: usar cache populado por eventos (assíncrono)
    if (!userCache.has(userId)) {
      return res.status(503).json({ error: 'users-service indisponível e usuário não encontrado no cache' });
    }
  }

  // const id = `o_${nanoid(6)}`;
  // const order = { id, userId, items, total, status: 'created', createdAt: new Date().toISOString() };
  // orders.set(id, order);
  const order = await prisma.order.create({ data: { userId, items, total, status: 'created' } }); // prisma


  // (Opcional) publicar evento order.created
  try {
    if (amqp?.ch) {
      amqp.ch.publish(EXCHANGE, ROUTING_KEYS.ORDER_CREATED, Buffer.from(JSON.stringify(order)), { persistent: true });
      console.log('[orders] published event:', ROUTING_KEYS.ORDER_CREATED, order.id);
    }
  } catch (err) {
    console.error('[orders] publish error:', err.message);
  }

  res.status(201).json(order);
});

// implementacao do order.cancelled
// app.delete('/:id', async (req, res) => { // o-cancel
//   const { id } = req.params; // o-cancel

//   if (!orders.has(id)) { // o-cancel
//     return res.status(404).json({ error: 'Pedido não encontrado' }); // o-cancel
//   } // o-cancel

//   const order = orders.get(id); // o-cancel
//   order.status = 'cancelled'; // o-cancel
//   order.cancelledAt = new Date().toISOString(); // o-cancel
//   orders.set(id, order); // o-cancel

//   try { // o-cancel
//     if (amqp?.ch) { // o-cancel
//       amqp.ch.publish(EXCHANGE, ROUTING_KEY_ORDER_CANCELLED, Buffer.from(JSON.stringify({ orderId: id })), { persistent: true }); // o-cancel
//       console.log('[orders] published event:', ROUTING_KEY_ORDER_CANCELLED, id); // o-cancel
//     } // o-cancel
//   } catch (err) { // o-cancel
//     console.error('[orders] publish cancel error:', err.message); // o-cancel
//   } // o-cancel

//   res.status(200).json({ message: 'Pedido cancelado com sucesso', order }); // o-cancel
// }); // o-cancel

app.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const order = await prisma.order.update({ where: { id }, data: { status: 'cancelled', cancelledAt: new Date() } }); // prisma

    // const order = orders.get(id); // removido-prisma
    // order.status = 'cancelled'; // removido-prisma
    // order.cancelledAt = new Date().toISOString(); // removido-prisma
    // orders.set(id, order); // removido-prisma

    if (amqp?.ch) {
      amqp.ch.publish(EXCHANGE, ROUTING_KEY_ORDER_CANCELLED, Buffer.from(JSON.stringify({ orderId: id })), { persistent: true });
      console.log('[orders] published event:', ROUTING_KEY_ORDER_CANCELLED, id);
    }

    res.status(200).json({ message: 'Pedido cancelado com sucesso', order });
  } catch (err) {
    res.status(404).json({ error: 'Pedido não encontrado' });
  }
});


app.listen(PORT, () => {
  console.log(`[orders] listening on http://localhost:${PORT}`);
  console.log(`[orders] users base url: ${USERS_BASE_URL}`);
});
