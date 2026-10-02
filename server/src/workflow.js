import { HttpError } from './errors.js';

/**
 * Order lifecycle. Every status change in the system goes through here so the
 * rules (who may move an order where) live in one place.
 *
 *   pending ──assign──▶ assigned ──pickup──▶ picked_up ──depart──▶ in_transit ──▶ delivered
 *      │                  │  ▲                   │                     │
 *      │                  │  └─reject/unassign   └────────▶ failed ◀───┘
 *      └──cancel──────────┴──cancel──▶ cancelled
 */
export const STATUSES = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled'];
export const ACTIVE_STATUSES = ['assigned', 'picked_up', 'in_transit'];
export const CLOSED_STATUSES = ['delivered', 'failed', 'cancelled'];

const TRANSITIONS = {
  pending: { assigned: ['admin', 'system'], cancelled: ['customer', 'admin'] },
  assigned: { picked_up: ['agent'], pending: ['agent', 'admin'], cancelled: ['customer', 'admin'] },
  picked_up: { in_transit: ['agent'], failed: ['agent', 'admin'] },
  in_transit: { delivered: ['agent'], failed: ['agent', 'admin'] },
  delivered: {},
  failed: {},
  cancelled: {},
};

export const STATUS_LABELS = {
  pending: 'Awaiting assignment',
  assigned: 'Agent assigned',
  picked_up: 'Picked up',
  in_transit: 'On the way',
  delivered: 'Delivered',
  failed: 'Delivery failed',
  cancelled: 'Cancelled',
};

export function allowedNext(from, role) {
  return Object.entries(TRANSITIONS[from] || {})
    .filter(([, roles]) => roles.includes(role))
    .map(([to]) => to);
}

export function assertTransition(from, to, role) {
  if (!STATUSES.includes(to)) throw new HttpError(400, `Unknown status "${to}"`);
  const rule = TRANSITIONS[from]?.[to];
  if (!rule) throw new HttpError(409, `Cannot move an order from "${from}" to "${to}"`);
  if (!rule.includes(role)) throw new HttpError(403, `A ${role} cannot move an order from "${from}" to "${to}"`);
}

/** Which timestamp column a status stamps when entered. */
export const STATUS_TIMESTAMP = {
  assigned: 'assigned_at',
  picked_up: 'picked_up_at',
  delivered: 'delivered_at',
};
