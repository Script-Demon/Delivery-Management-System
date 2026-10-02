import { Router } from 'express';
import { validate, notFound } from '../errors.js';
import { now, tx } from '../db.js';

const RULES = {
  label: { required: true, max: 40 },
  line: { required: true, max: 160 },
  city: { required: true, max: 60 },
  notes: { max: 200 },
  lat: { required: true, type: 'number', min: -90, max: 90 },
  lng: { required: true, type: 'number', min: -180, max: 180 },
  isDefault: { type: 'bool', default: false },
};

const toAddress = (a) => ({
  id: a.id, label: a.label, line: a.line, city: a.city, notes: a.notes,
  lat: a.lat, lng: a.lng, isDefault: !!a.is_default, createdAt: a.created_at,
});

export default function addressRoutes(db) {
  const r = Router();
  const own = (req) => {
    const a = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!a) throw notFound('Address');
    return a;
  };
  const makeDefault = (userId, id) => {
    db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(userId);
    db.prepare('UPDATE addresses SET is_default = 1 WHERE id = ?').run(id);
  };

  r.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, label').all(req.user.id);
    res.json({ items: rows.map(toAddress) });
  });

  r.post('/', (req, res) => {
    const a = validate(req.body, RULES);
    const id = tx(db, () => {
      const isFirst = !db.prepare('SELECT 1 FROM addresses WHERE user_id = ?').get(req.user.id);
      const { lastInsertRowid } = db
        .prepare('INSERT INTO addresses (user_id, label, line, city, notes, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(req.user.id, a.label, a.line, a.city, a.notes || null, a.lat, a.lng, now());
      if (a.isDefault || isFirst) makeDefault(req.user.id, lastInsertRowid);
      return lastInsertRowid;
    });
    res.status(201).json(toAddress(db.prepare('SELECT * FROM addresses WHERE id = ?').get(id)));
  });

  r.put('/:id', (req, res) => {
    const existing = own(req);
    const a = validate(req.body, RULES);
    tx(db, () => {
      db.prepare('UPDATE addresses SET label = ?, line = ?, city = ?, notes = ?, lat = ?, lng = ? WHERE id = ?')
        .run(a.label, a.line, a.city, a.notes || null, a.lat, a.lng, existing.id);
      if (a.isDefault) makeDefault(req.user.id, existing.id);
    });
    res.json(toAddress(db.prepare('SELECT * FROM addresses WHERE id = ?').get(existing.id)));
  });

  r.delete('/:id', (req, res) => {
    const existing = own(req);
    // Orders keep a snapshot of the address, so deleting it never breaks history.
    tx(db, () => {
      db.prepare('DELETE FROM addresses WHERE id = ?').run(existing.id);
      if (existing.is_default) {
        const next = db.prepare('SELECT id FROM addresses WHERE user_id = ? ORDER BY id LIMIT 1').get(req.user.id);
        if (next) makeDefault(req.user.id, next.id);
      }
    });
    res.status(204).end();
  });

  return r;
}
