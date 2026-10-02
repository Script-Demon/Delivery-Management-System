import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import { getOrderRow, canView, recordLocation } from './orders.js';

/**
 * Rooms:
 *   user:<id>   every socket of a signed-in user
 *   admins      every admin socket
 *   order:<id>  anyone currently viewing that order (permission-checked on join)
 *
 * Order events carry only ids; clients refetch through the REST API so all
 * permission rules stay in one place.
 */
export function createNotifier(io) {
  const emit = (rooms, event, payload) => {
    if (io && rooms.length) io.to(rooms).emit(event, payload);
  };
  return {
    orderChanged(row, message, { previousAgentId } = {}) {
      const rooms = ['admins', `order:${row.id}`, `user:${row.customer_id}`];
      if (row.agent_id) rooms.push(`user:${row.agent_id}`);
      if (previousAgentId && previousAgentId !== row.agent_id) rooms.push(`user:${previousAgentId}`);
      emit(rooms, 'order:changed', { id: row.id, code: row.code, status: row.status, message, at: new Date().toISOString() });
    },
    agentChanged(agent) {
      emit(['admins'], 'agent:changed', { id: agent.id });
    },
    agentLocation(agentId, orderIds, point) {
      emit(['admins', ...orderIds.map((id) => `order:${id}`)], 'agent:location', { agentId, orderIds, ...point });
    },
  };
}

/** Creates the socket server; call io.attach(httpServer) once the HTTP server exists. */
export function createRealtime(db) {
  const io = new Server({ cors: { origin: true } });
  const notifier = createNotifier(io);
  const lastPing = new Map();

  io.use((socket, next) => {
    try {
      socket.user = verifyToken(socket.handshake.auth?.token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket;
    socket.join(`user:${user.id}`);
    if (user.role === 'admin') socket.join('admins');

    socket.on('order:watch', (orderId, ack) => {
      try {
        const row = getOrderRow(db, Number(orderId));
        if (!canView(user, row)) throw new Error('forbidden');
        socket.join(`order:${row.id}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });
    socket.on('order:unwatch', (orderId) => socket.leave(`order:${Number(orderId)}`));

    socket.on('agent:location', (point, ack) => {
      if (user.role !== 'agent') return ack?.({ ok: false, error: 'Only agents share location' });
      // Throttle to one stored ping per second per agent.
      const t = Date.now();
      if (t - (lastPing.get(user.id) || 0) < 1000) return ack?.({ ok: true, throttled: true });
      lastPing.set(user.id, t);
      try {
        const lat = Number(point?.lat);
        const lng = Number(point?.lng);
        const at = new Date().toISOString();
        const orderIds = recordLocation(db, user.id, lat, lng, at);
        notifier.agentLocation(user.id, orderIds, { lat, lng, at });
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });
  });

  return { io, notifier };
}
