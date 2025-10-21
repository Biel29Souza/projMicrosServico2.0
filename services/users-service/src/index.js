import express from 'express';
import morgan from 'morgan';
//import { nanoid } from 'nanoid';
import { PrismaClient } from '@prisma/client'; // prisma
import { createChannel } from './amqp.js';
import { ROUTING_KEYS } from '../common/events.js';

const app = express();
app.use(express.json());
app.use(morgan('dev'));

const prisma = new PrismaClient(); // prisma

const PORT = process.env.PORT || 3001;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = process.env.EXCHANGE || 'app.topic';

// In-memory "DB"
//const users = new Map(); removido para fazer o prisma

let amqp = null;
(async () => {
  try {
    amqp = await createChannel(RABBITMQ_URL, EXCHANGE);
    console.log('[users] AMQP connected');
  } catch (err) {
    console.error('[users] AMQP connection failed:', err.message);
  }
})();

app.get('/health', (req, res) => res.json({ ok: true, service: 'users' }));

app.get('/', async (req, res) => {
  const users = await prisma.user.findMany(); // prisma
  res.json(users); // prisma
});

app.post('/', async (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });

  // const id = `u_${nanoid(6)}`;
  // const user = { id, name, email, createdAt: new Date().toISOString() };
  // users.set(id, user);  removido prisma
  const user = await prisma.user.create({ data: { name, email } }); // prisma

  // Publish event
  try {
    if (amqp?.ch) {
      const payload = Buffer.from(JSON.stringify(user));
      amqp.ch.publish(EXCHANGE, ROUTING_KEYS.USER_CREATED, payload, { persistent: true });
      console.log('[users] published event:', ROUTING_KEYS.USER_CREATED, user);
    }
  } catch (err) {
    console.error('[users] publish error:', err.message);
  }

  res.status(201).json(user);
});


app.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } }); // prisma
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json(user);
});

// Implementando o user.update 
// app.put('/:id', async (req, res) => { // u-update
//   const { id } = req.params; // u-update
//   const { name, email } = req.body || {}; // u-update

//   const user = users.get(id); // u-update
//   if (!user) return res.status(404).json({ error: 'Usuário não encontrado' }); // u-update

//   if (name) user.name = name; // u-update
//   if (email) user.email = email; // u-update
//   user.updatedAt = new Date().toISOString(); // u-update
//   users.set(id, user); // u-update

//   try { // u-update
//     if (amqp?.ch) { // u-update
//       const payload = Buffer.from(JSON.stringify(user)); // u-update
//       amqp.ch.publish(EXCHANGE, ROUTING_KEYS.USER_UPDATED, payload, { persistent: true }); // u-update
//       console.log('[users] published event:', ROUTING_KEYS.USER_UPDATED, user.id); // u-update
//     } // u-update
//   } catch (err) { // u-update
//     console.error('[users] publish update error:', err.message); // u-update
//   } // u-update

//   res.status(200).json(user); // u-update
// }); // u-update

app.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body || {};

  try {
    const user = await prisma.user.update({ where: { id }, data: { name, email } }); // prisma

    // users.set(id, user); // removido-prisma

    if (amqp?.ch) {
      const payload = Buffer.from(JSON.stringify(user));
      amqp.ch.publish(EXCHANGE, ROUTING_KEYS.USER_UPDATED, payload, { persistent: true });
      console.log('[users] published event:', ROUTING_KEYS.USER_UPDATED, user.id);
    }

    res.status(200).json(user);
  } catch (err) {
    res.status(404).json({ error: 'Usuário não encontrado' });
  }
});


app.listen(PORT, () => {
  console.log(`[users] listening on http://localhost:${PORT}`);
});
