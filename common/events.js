// module.exports = {
//   ROUTING_KEYS: {
//     USER_CREATED: 'user.created',
//     ORDER_CREATED: 'order.created'
//   }
// };

// export const ROUTING_KEYS = {
//   USER_CREATED: 'user.created',
//   ORDER_CREATED: 'order.created',
// };

// // Ajustado para receber o order.cancelled
// export const ROUTING_KEYS = {
//   USER_CREATED: 'user.created',
//   ORDER_CREATED: 'order.created',
//   ORDER_CANCELLED: 'order.cancelled' // o-cancel
// };

// Ajustado para receber o user.updated
export const ROUTING_KEYS = {
  USER_CREATED: 'user.created',
  ORDER_CREATED: 'order.created',
  ORDER_CANCELLED: 'order.cancelled', // o-cancel
  USER_UPDATED: 'user.updated' // u-update
};