import { Router } from 'express';
import { validate, forbidden } from '../errors.js';
import { requireRole } from '../auth.js';
import { normalizeBdPhone } from '../bd.js';
import {
  listOrders, orderDetail, createOrder, quoteFor, assignOrder, autoAssign, changeStatus, rateOrder,
  getOrderRow, toOrder, rankAgentsFor, loadOrderFor, canView,
} from '../orders.js';

const ORDER_RULES = {
  pickupAddressId: { required: true, type: 'int' },
  dropoffAddressId: { required: true, type: 'int' },
  packageType: { required: true, oneOf: ['food', 'parcel', 'product'] },
  weightKg: { type: 'number', min: 0.1, max: 50, default: 1 },
  priority: { oneOf: ['standard', 'express'], default: 'standard' },
};

export default function orderRoutes(db, notifier) {
  const r = Router();
  const id = (req) => Number(req.params.id);

  r.get('/', (req, res) => {
    res.json(listOrders(db, req.user, req.query));
  });

  r.post('/quote', requireRole('customer'), (req, res) => {
    const input = validate(req.body, ORDER_RULES);
    const { distanceKm, fee, etaMinutes } = quoteFor(db, req.user, input);
    res.json({ distanceKm, fee, etaMinutes });
  });

  r.post('/', requireRole('customer'), (req, res) => {
    const input = validate(req.body, {
      ...ORDER_RULES,
      description: { required: true, max: 200 },
      recipientName: { max: 80 },
      recipientPhone: { max: 20 },
    });
    input.recipientPhone = normalizeBdPhone(input.recipientPhone, 'recipientPhone');
    const orderId = createOrder(db, req.user, input);
    if (process.env.AUTO_ASSIGN === 'true') {
      try { autoAssign(db, orderId); } catch { /* stays pending for an admin to handle */ }
    }
    const row = getOrderRow(db, orderId);
    notifier.orderChanged(row, `New order ${row.code} placed by ${row.customer_name}`);
    res.status(201).json(orderDetail(db, req.user, orderId));
  });

  r.get('/:id', (req, res) => {
    res.json(orderDetail(db, req.user, id(req)));
  });

  // Agent suggestions for the admin's assign dialog.
  r.get('/:id/candidates', requireRole('admin'), (req, res) => {
    const row = getOrderRow(db, id(req));
    res.json({ items: rankAgentsFor(db, row) });
  });

  r.post('/:id/assign', requireRole('admin'), (req, res) => {
    const { agentId } = validate(req.body, { agentId: { required: true, type: 'int' } });
    const row = assignOrder(db, req.user, id(req), agentId);
    notifier.orderChanged(row, `${row.code} assigned to ${row.agent_name}`);
    res.json(orderDetail(db, req.user, row.id));
  });

  r.post('/:id/auto-assign', requireRole('admin'), (req, res) => {
    const row = autoAssign(db, id(req));
    notifier.orderChanged(row, `${row.code} auto-assigned to ${row.agent_name}`);
    res.json(orderDetail(db, req.user, row.id));
  });

  r.post('/auto-assign-all', requireRole('admin'), (req, res) => {
    const pending = db.prepare(`SELECT id FROM orders WHERE status = 'pending' ORDER BY priority = 'express' DESC, id`).all();
    let assigned = 0;
    for (const { id: orderId } of pending) {
      try {
        const row = autoAssign(db, orderId);
        notifier.orderChanged(row, `${row.code} auto-assigned to ${row.agent_name}`);
        assigned++;
      } catch {
        break; // no capacity left
      }
    }
    res.json({ assigned, remaining: pending.length - assigned });
  });

  r.post('/:id/status', requireRole('agent', 'admin', 'customer'), (req, res) => {
    const { status, note } = validate(req.body, {
      status: { required: true },
      note: { max: 300 },
    });
    const before = loadOrderFor(db, req.user, id(req));
    const row = changeStatus(db, req.user, id(req), status, { note });
    const who = req.user.role === 'customer' ? 'the customer' : req.user.name;
    let message = `${row.code}: ${toOrder(row).statusLabel.toLowerCase()} (by ${who})`;
    if (status === 'pending' && before.agent_id) message = `${row.code} was released by ${req.user.role === 'agent' ? req.user.name : 'an admin'} and needs reassignment`;
    notifier.orderChanged(row, message, { previousAgentId: before.agent_id });
    // An agent who just released the job can no longer view its detail.
    res.json(canView(req.user, row) ? orderDetail(db, req.user, row.id) : toOrder(row, req.user));
  });

  r.post('/:id/cancel', (req, res) => {
    if (req.user.role === 'agent') throw forbidden('Agents cannot cancel orders; reject the job instead');
    const { reason } = validate(req.body, { reason: { max: 300 } });
    const before = loadOrderFor(db, req.user, id(req));
    const row = changeStatus(db, req.user, id(req), 'cancelled', { note: reason || 'Cancelled' });
    notifier.orderChanged(row, `${row.code} was cancelled`, { previousAgentId: before.agent_id });
    res.json(orderDetail(db, req.user, row.id));
  });

  r.post('/:id/rate', requireRole('customer'), (req, res) => {
    const { rating, feedback } = validate(req.body, {
      rating: { required: true, type: 'int', min: 1, max: 5 },
      feedback: { max: 500 },
    });
    const row = rateOrder(db, req.user, id(req), rating, feedback);
    notifier.orderChanged(row, `${row.code} rated ${rating}★`);
    res.json(orderDetail(db, req.user, row.id));
  });

  return r;
}
