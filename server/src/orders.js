import { tx, now } from './db.js';
import { HttpError, notFound, forbidden, conflict, badRequest } from './errors.js';
import { assertTransition, allowedNext, ACTIVE_STATUSES, CLOSED_STATUSES, STATUS_LABELS, STATUS_TIMESTAMP } from './workflow.js';
import { quote, haversineKm, AGENT_SHARE } from './pricing.js';

export const MAX_ACTIVE_PER_AGENT = 3;

const ORDER_SELECT = `
  SELECT o.*,
         c.name AS customer_name, c.phone AS customer_phone,
         a.name AS agent_name, a.phone AS agent_phone,
         ag.vehicle_type AS agent_vehicle, ag.lat AS agent_lat, ag.lng AS agent_lng, ag.location_at AS agent_location_at
  FROM orders o
  JOIN users c ON c.id = o.customer_id
  LEFT JOIN users a ON a.id = o.agent_id
  LEFT JOIN agents ag ON ag.user_id = o.agent_id`;

export function toOrder(row, viewer) {
  const live = ACTIVE_STATUSES.includes(row.status);
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status],
    packageType: row.package_type,
    description: row.description,
    weightKg: row.weight_kg,
    priority: row.priority,
    pickup: { label: row.pickup_label, line: row.pickup_line, lat: row.pickup_lat, lng: row.pickup_lng },
    dropoff: { label: row.dropoff_label, line: row.dropoff_line, lat: row.dropoff_lat, lng: row.dropoff_lng },
    recipient: { name: row.recipient_name, phone: row.recipient_phone },
    distanceKm: row.distance_km,
    fee: row.fee,
    agentEarning: Math.round(row.fee * AGENT_SHARE),
    rating: row.rating,
    feedback: row.feedback,
    customer: { id: row.customer_id, name: row.customer_name, phone: row.customer_phone },
    agent: row.agent_id
      ? {
          id: row.agent_id,
          name: row.agent_name,
          phone: row.agent_phone,
          vehicleType: row.agent_vehicle,
          // Only expose the agent's position while they are actually working this order.
          location: live && row.agent_lat != null ? { lat: row.agent_lat, lng: row.agent_lng, at: row.agent_location_at } : null,
        }
      : null,
    createdAt: row.created_at,
    assignedAt: row.assigned_at,
    pickedUpAt: row.picked_up_at,
    deliveredAt: row.delivered_at,
    closedAt: row.closed_at,
    nextStatuses: viewer ? allowedNext(row.status, viewer.role) : undefined,
  };
}

export function getOrderRow(db, id) {
  const row = db.prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(id);
  if (!row) throw notFound('Order');
  return row;
}

export function canView(user, row) {
  if (user.role === 'admin') return true;
  if (user.role === 'customer') return row.customer_id === user.id;
  if (user.role === 'agent') return row.agent_id === user.id;
  return false;
}

export function loadOrderFor(db, user, id) {
  const row = getOrderRow(db, id);
  if (!canView(user, row)) throw notFound('Order');
  return row;
}

export function orderDetail(db, user, id) {
  const row = loadOrderFor(db, user, id);
  const events = db
    .prepare(
      `SELECT e.id, e.status, e.note, e.created_at AS createdAt, u.name AS actorName, u.role AS actorRole
       FROM order_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.order_id = ? ORDER BY e.id`
    )
    .all(id);
  const trail = db
    .prepare('SELECT lat, lng, at FROM location_pings WHERE order_id = ? ORDER BY id DESC LIMIT 300')
    .all(id)
    .reverse();
  return { ...toOrder(row, user), events, trail };
}

export function listOrders(db, user, { status, q, page = 1, pageSize = 20, scope } = {}) {
  const where = [];
  const params = [];
  if (user.role === 'customer') { where.push('o.customer_id = ?'); params.push(user.id); }
  if (user.role === 'agent') { where.push('o.agent_id = ?'); params.push(user.id); }
  if (scope === 'active') where.push(`o.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`), params.push(...ACTIVE_STATUSES);
  if (scope === 'open') where.push(`o.status NOT IN (${CLOSED_STATUSES.map(() => '?').join(',')})`), params.push(...CLOSED_STATUSES);
  if (scope === 'closed') where.push(`o.status IN (${CLOSED_STATUSES.map(() => '?').join(',')})`), params.push(...CLOSED_STATUSES);
  if (status) {
    const list = String(status).split(',');
    where.push(`o.status IN (${list.map(() => '?').join(',')})`);
    params.push(...list);
  }
  if (q) {
    where.push('(o.code LIKE ? OR o.description LIKE ? OR o.recipient_name LIKE ? OR c.name LIKE ? OR o.dropoff_line LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const p = Math.max(1, Number(page) || 1);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM orders o JOIN users c ON c.id = o.customer_id ${clause}`).get(...params).n;
  const rows = db.prepare(`${ORDER_SELECT} ${clause} ORDER BY o.id DESC LIMIT ? OFFSET ?`).all(...params, size, (p - 1) * size);
  return { items: rows.map((r) => toOrder(r, user)), total, page: p, pageSize: size };
}

function addressFor(db, userId, addressId, field) {
  const a = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(addressId, userId);
  if (!a) throw badRequest('Validation failed', { [field]: 'is not one of your saved addresses' });
  return a;
}

export function quoteFor(db, user, input) {
  const pickup = addressFor(db, user.id, input.pickupAddressId, 'pickupAddressId');
  const dropoff = addressFor(db, user.id, input.dropoffAddressId, 'dropoffAddressId');
  if (pickup.id === dropoff.id) throw badRequest('Validation failed', { dropoffAddressId: 'must differ from the pickup address' });
  return {
    pickup,
    dropoff,
    ...quote({
      pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng,
      packageType: input.packageType, weightKg: input.weightKg, priority: input.priority,
    }),
  };
}

export function createOrder(db, user, input, { createdAt = now() } = {}) {
  const { pickup, dropoff, distanceKm, fee } = quoteFor(db, user, input);
  return tx(db, () => {
    const { lastInsertRowid: id } = db
      .prepare(
        `INSERT INTO orders (customer_id, package_type, description, weight_kg, priority,
           pickup_label, pickup_line, pickup_lat, pickup_lng,
           dropoff_label, dropoff_line, dropoff_lat, dropoff_lng,
           recipient_name, recipient_phone, distance_km, fee, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      )
      .run(
        user.id, input.packageType, input.description, input.weightKg, input.priority,
        pickup.label, `${pickup.line}, ${pickup.city}`, pickup.lat, pickup.lng,
        dropoff.label, `${dropoff.line}, ${dropoff.city}`, dropoff.lat, dropoff.lng,
        input.recipientName || user.name, input.recipientPhone || null, distanceKm, fee, createdAt
      );
    db.prepare('UPDATE orders SET code = ? WHERE id = ?').run(`DLV-${String(id).padStart(6, '0')}`, id);
    db.prepare('INSERT INTO order_events (order_id, status, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'pending', 'Order placed', user.id, createdAt);
    return Number(id);
  });
}

/**
 * Apply a status change. Caller must already have checked that the actor may
 * see the order; this enforces the lifecycle rules and records the event.
 */
function applyTransition(db, row, to, actor, { note, agentId, at = now() } = {}) {
  assertTransition(row.status, to, actor.role);
  const sets = ['status = ?'];
  const params = [to];
  const stamp = STATUS_TIMESTAMP[to];
  if (stamp) { sets.push(`${stamp} = ?`); params.push(at); }
  if (to === 'assigned') { sets.push('agent_id = ?'); params.push(agentId); }
  if (to === 'pending') sets.push('agent_id = NULL', 'assigned_at = NULL');
  if (CLOSED_STATUSES.includes(to)) { sets.push('closed_at = ?'); params.push(at); }
  db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ? AND status = ?`).run(...params, row.id, row.status);
  db.prepare('INSERT INTO order_events (order_id, status, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(row.id, to, note || null, actor.role === 'system' ? null : actor.id, at);
}

function activeLoad(db, agentId) {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM orders WHERE agent_id = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`)
    .get(agentId, ...ACTIVE_STATUSES).n;
}

function checkAgentAssignable(db, agentId) {
  const agent = db
    .prepare(`SELECT u.id, u.name, u.is_active, ag.availability FROM users u JOIN agents ag ON ag.user_id = u.id WHERE u.id = ? AND u.role = 'agent'`)
    .get(agentId);
  if (!agent) throw badRequest('Validation failed', { agentId: 'is not a delivery agent' });
  if (!agent.is_active) throw conflict(`${agent.name}'s account is disabled`);
  if (activeLoad(db, agentId) >= MAX_ACTIVE_PER_AGENT) throw conflict(`${agent.name} already has ${MAX_ACTIVE_PER_AGENT} active deliveries`);
  return agent;
}

export function assignOrder(db, actor, orderId, agentId, opts = {}) {
  return tx(db, () => {
    let row = getOrderRow(db, orderId);
    if (row.agent_id === agentId && row.status === 'assigned') return row;
    const agent = checkAgentAssignable(db, agentId);
    if (row.status === 'assigned') {
      // Reassignment: release from the current agent first so the history shows both steps.
      applyTransition(db, row, 'pending', actor, { note: `Unassigned from ${row.agent_name}`, at: opts.at });
      row = getOrderRow(db, orderId);
    }
    applyTransition(db, row, 'assigned', actor, { agentId, note: opts.note || `Assigned to ${agent.name}`, at: opts.at });
    return getOrderRow(db, orderId);
  });
}

/** Rank online agents with spare capacity by distance to the pickup point. */
export function rankAgentsFor(db, row) {
  const candidates = db
    .prepare(
      `SELECT u.id, u.name, ag.lat, ag.lng,
              (SELECT COUNT(*) FROM orders o WHERE o.agent_id = u.id AND o.status IN ('assigned','picked_up','in_transit')) AS load
       FROM users u JOIN agents ag ON ag.user_id = u.id
       WHERE u.role = 'agent' AND u.is_active = 1 AND ag.availability = 'online'`
    )
    .all()
    .filter((a) => a.load < MAX_ACTIVE_PER_AGENT);
  return candidates
    .map((a) => ({
      ...a,
      distanceKm: a.lat == null ? null : haversineKm(a.lat, a.lng, row.pickup_lat, row.pickup_lng),
    }))
    .sort((a, b) => {
      // Prefer fewer active jobs, then proximity; agents with unknown location go last.
      if (a.load !== b.load) return a.load - b.load;
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    });
}

export function autoAssign(db, orderId) {
  const row = getOrderRow(db, orderId);
  if (row.status !== 'pending') throw conflict('Only pending orders can be auto-assigned');
  const [best] = rankAgentsFor(db, row);
  if (!best) throw conflict('No online agent has capacity right now');
  const dist = best.distanceKm == null ? '' : ` (${best.distanceKm.toFixed(1)} km from pickup)`;
  return assignOrder(db, { role: 'system' }, orderId, best.id, { note: `Auto-assigned to ${best.name}${dist}` });
}

export function changeStatus(db, actor, orderId, to, { note, at } = {}) {
  return tx(db, () => {
    const row = loadOrderFor(db, actor, orderId);
    if (to === 'assigned') throw badRequest('Use the assign endpoint to assign an order');
    if (to === 'pending' && actor.role === 'agent') note = note ? `Rejected by agent: ${note}` : 'Rejected by agent';
    if (to === 'pending' && actor.role === 'admin') note = note || `Unassigned from ${row.agent_name}`;
    if (to === 'failed' && !note) throw badRequest('Validation failed', { note: 'is required when a delivery fails' });
    applyTransition(db, row, to, actor, { note, at });
    return getOrderRow(db, orderId);
  });
}

export function rateOrder(db, user, orderId, rating, feedback) {
  const row = loadOrderFor(db, user, orderId);
  if (user.role !== 'customer') throw forbidden('Only the customer can rate a delivery');
  if (row.status !== 'delivered') throw conflict('You can only rate delivered orders');
  if (row.rating) throw conflict('This delivery has already been rated');
  db.prepare('UPDATE orders SET rating = ?, feedback = ? WHERE id = ?').run(rating, feedback || null, orderId);
  return getOrderRow(db, orderId);
}

/** Record an agent's position; returns the active order ids it was logged against. */
export function recordLocation(db, agentId, lat, lng, at = now()) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, 'Invalid coordinates');
  }
  return tx(db, () => {
    db.prepare('UPDATE agents SET lat = ?, lng = ?, location_at = ? WHERE user_id = ?').run(lat, lng, at, agentId);
    const active = db
      .prepare(`SELECT id FROM orders WHERE agent_id = ? AND status IN ('assigned','picked_up','in_transit')`)
      .all(agentId)
      .map((r) => r.id);
    const ins = db.prepare('INSERT INTO location_pings (order_id, agent_id, lat, lng, at) VALUES (?, ?, ?, ?, ?)');
    for (const id of active) ins.run(id, agentId, lat, lng, at);
    return active;
  });
}
