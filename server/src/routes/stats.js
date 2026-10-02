import { Router } from 'express';
import { requireRole } from '../auth.js';
import { AGENT_SHARE } from '../pricing.js';
import { TIMEZONE_OFFSET, TIMEZONE_OFFSET_MS } from '../bd.js';

// Timestamps are stored in UTC; reports group by the Dhaka calendar day and hour.
const localDay = (col) => `date(${col}, '${TIMEZONE_OFFSET}')`;

const DAYS = 14;

function lastNDays(n) {
  const days = [];
  const today = new Date(Date.now() + TIMEZONE_OFFSET_MS);
  today.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) days.push(new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10));
  return days;
}

/** Fill gaps so charts always show a continuous range of days. */
function series(rows, days, fields) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return days.map((day) => {
    const row = byDay.get(day) || {};
    return Object.fromEntries([['day', day], ...fields.map((f) => [f, row[f] ?? 0])]);
  });
}

export default function statsRoutes(db) {
  const r = Router();

  r.get('/overview', requireRole('admin'), (_req, res) => {
    const days = lastNDays(DAYS);
    const since = days[0];
    const today = days[days.length - 1];

    const byStatus = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all().map((r) => [r.status, r.n]));
    const totals = db.prepare(
      `SELECT COUNT(*) AS orders,
              SUM(status = 'delivered') AS delivered,
              COALESCE(SUM(CASE WHEN status = 'delivered' THEN fee END), 0) AS revenue,
              ROUND(AVG(CASE WHEN status = 'delivered' THEN (julianday(delivered_at) - julianday(created_at)) * 1440 END), 1) AS avg_delivery_min,
              ROUND(AVG(rating), 2) AS avg_rating,
              SUM(status IN ('delivered','failed')) AS attempted
       FROM orders`
    ).get();
    const todayRow = db.prepare(
      `SELECT COUNT(*) AS orders, SUM(status = 'delivered') AS delivered,
              COALESCE(SUM(CASE WHEN status = 'delivered' THEN fee END), 0) AS revenue
       FROM orders WHERE ${localDay('created_at')} = ?`
    ).get(today);
    const agents = db.prepare(
      `SELECT COUNT(*) AS total, SUM(ag.availability = 'online') AS online
       FROM users u JOIN agents ag ON ag.user_id = u.id WHERE u.role = 'agent' AND u.is_active = 1`
    ).get();

    const daily = series(
      db.prepare(
        `SELECT ${localDay('created_at')} AS day, COUNT(*) AS orders,
                SUM(status = 'delivered') AS delivered, SUM(status IN ('failed','cancelled')) AS lost,
                ROUND(COALESCE(SUM(CASE WHEN status = 'delivered' THEN fee END), 0), 2) AS revenue
         FROM orders WHERE ${localDay('created_at')} >= ? GROUP BY day`
      ).all(since),
      days,
      ['orders', 'delivered', 'lost', 'revenue']
    );

    const byType = db.prepare('SELECT package_type AS type, COUNT(*) AS n FROM orders GROUP BY package_type ORDER BY n DESC').all();
    const byHour = db.prepare(
      `SELECT CAST(strftime('%H', created_at, '${TIMEZONE_OFFSET}') AS INTEGER) AS hour, COUNT(*) AS n FROM orders GROUP BY hour ORDER BY hour`
    ).all();
    const topAgents = db.prepare(
      `SELECT u.id, u.name, COUNT(*) AS delivered, ROUND(AVG(o.rating), 2) AS avg_rating,
              ROUND(AVG((julianday(o.delivered_at) - julianday(o.picked_up_at)) * 1440), 1) AS avg_trip_min
       FROM orders o JOIN users u ON u.id = o.agent_id
       WHERE o.status = 'delivered' GROUP BY u.id ORDER BY delivered DESC LIMIT 5`
    ).all();

    res.json({
      totals: {
        orders: totals.orders,
        delivered: totals.delivered || 0,
        revenue: Math.round(totals.revenue * 100) / 100,
        avgDeliveryMinutes: totals.avg_delivery_min,
        avgRating: totals.avg_rating,
        successRate: totals.attempted ? Math.round((totals.delivered / totals.attempted) * 1000) / 10 : null,
        pending: byStatus.pending || 0,
        active: (byStatus.assigned || 0) + (byStatus.picked_up || 0) + (byStatus.in_transit || 0),
      },
      today: { orders: todayRow.orders, delivered: todayRow.delivered || 0, revenue: Math.round(todayRow.revenue * 100) / 100 },
      agents: { total: agents.total, online: agents.online || 0 },
      byStatus,
      byType,
      byHour,
      daily,
      topAgents,
    });
  });

  r.get('/agent', requireRole('agent'), (req, res) => {
    const days = lastNDays(DAYS);
    const t = db.prepare(
      `SELECT SUM(status = 'delivered') AS delivered, SUM(status = 'failed') AS failed,
              COALESCE(SUM(CASE WHEN status = 'delivered' THEN fee END), 0) AS fees,
              ROUND(AVG(rating), 2) AS avg_rating,
              COALESCE(SUM(CASE WHEN status = 'delivered' THEN distance_km END), 0) AS km
       FROM orders WHERE agent_id = ?`
    ).get(req.user.id);
    const daily = series(
      db.prepare(
        `SELECT ${localDay('delivered_at')} AS day, COUNT(*) AS delivered, ROUND(SUM(fee) * ${AGENT_SHARE}) AS earnings
         FROM orders WHERE agent_id = ? AND status = 'delivered' AND ${localDay('delivered_at')} >= ? GROUP BY day`
      ).all(req.user.id, days[0]),
      days,
      ['delivered', 'earnings']
    );
    const today = daily[daily.length - 1];
    res.json({
      delivered: t.delivered || 0,
      failed: t.failed || 0,
      earnings: Math.round(t.fees * AGENT_SHARE),
      avgRating: t.avg_rating,
      distanceKm: Math.round(t.km * 10) / 10,
      today: { delivered: today.delivered, earnings: today.earnings },
      daily,
    });
  });

  return r;
}
