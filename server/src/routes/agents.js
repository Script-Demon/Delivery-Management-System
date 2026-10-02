import { Router } from 'express';
import { validate, notFound } from '../errors.js';
import { requireRole } from '../auth.js';
import { MAX_ACTIVE_PER_AGENT } from '../orders.js';
import { AGENT_SHARE } from '../pricing.js';
import { VEHICLES } from '../bd.js';

const AGENT_SELECT = `
  SELECT u.id, u.name, u.email, u.phone, u.is_active, u.created_at,
         ag.vehicle_type, ag.availability, ag.lat, ag.lng, ag.location_at,
         (SELECT COUNT(*) FROM orders o WHERE o.agent_id = u.id AND o.status IN ('assigned','picked_up','in_transit')) AS active_orders,
         (SELECT COUNT(*) FROM orders o WHERE o.agent_id = u.id AND o.status = 'delivered') AS delivered,
         (SELECT COUNT(*) FROM orders o WHERE o.agent_id = u.id AND o.status = 'failed') AS failed,
         (SELECT ROUND(AVG(o.rating), 2) FROM orders o WHERE o.agent_id = u.id AND o.rating IS NOT NULL) AS avg_rating,
         (SELECT COALESCE(SUM(o.fee), 0) FROM orders o WHERE o.agent_id = u.id AND o.status = 'delivered') AS delivered_fees
  FROM users u JOIN agents ag ON ag.user_id = u.id
  WHERE u.role = 'agent'`;

export const toAgent = (a) => ({
  id: a.id,
  name: a.name,
  email: a.email,
  phone: a.phone,
  isActive: !!a.is_active,
  vehicleType: a.vehicle_type,
  availability: a.availability,
  // "busy" is derived: online with no spare capacity.
  workState: a.availability === 'offline' ? 'offline' : a.active_orders >= MAX_ACTIVE_PER_AGENT ? 'busy' : a.active_orders > 0 ? 'on_delivery' : 'idle',
  location: a.lat != null ? { lat: a.lat, lng: a.lng, at: a.location_at } : null,
  activeOrders: a.active_orders,
  capacity: MAX_ACTIVE_PER_AGENT,
  delivered: a.delivered,
  failed: a.failed,
  avgRating: a.avg_rating,
  earnings: Math.round(a.delivered_fees * AGENT_SHARE),
  createdAt: a.created_at,
});

export default function agentRoutes(db, notifier) {
  const r = Router();
  const getAgent = (agentId) => {
    const a = db.prepare(`${AGENT_SELECT} AND u.id = ?`).get(agentId);
    if (!a) throw notFound('Agent');
    return toAgent(a);
  };

  r.get('/', requireRole('admin'), (_req, res) => {
    res.json({ items: db.prepare(`${AGENT_SELECT} ORDER BY ag.availability = 'online' DESC, u.name`).all().map(toAgent) });
  });

  r.get('/me', requireRole('agent'), (req, res) => res.json(getAgent(req.user.id)));

  r.patch('/me', requireRole('agent'), (req, res) => {
    const input = validate(req.body, {
      availability: { oneOf: ['online', 'offline'] },
      vehicleType: { oneOf: VEHICLES },
    });
    if (input.availability) db.prepare('UPDATE agents SET availability = ? WHERE user_id = ?').run(input.availability, req.user.id);
    if (input.vehicleType) db.prepare('UPDATE agents SET vehicle_type = ? WHERE user_id = ?').run(input.vehicleType, req.user.id);
    const agent = getAgent(req.user.id);
    notifier.agentChanged(agent);
    res.json(agent);
  });

  r.patch('/:id', requireRole('admin'), (req, res) => {
    const agentId = Number(req.params.id);
    getAgent(agentId);
    const { isActive } = validate(req.body, { isActive: { required: true, type: 'bool' } });
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, agentId);
    if (!isActive) db.prepare(`UPDATE agents SET availability = 'offline' WHERE user_id = ?`).run(agentId);
    const agent = getAgent(agentId);
    notifier.agentChanged(agent);
    res.json(agent);
  });

  return r;
}
