import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { validate, HttpError, conflict, badRequest } from '../errors.js';
import { signToken, publicUser, authenticate } from '../auth.js';
import { now, tx } from '../db.js';
import { VEHICLES, normalizeBdPhone } from '../bd.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function authRoutes(db) {
  const r = Router();

  r.post('/register', (req, res) => {
    const input = validate(req.body, {
      name: { required: true, max: 80 },
      email: { required: true, pattern: EMAIL, message: 'must be a valid email address', max: 120 },
      password: { required: true, min: 6, max: 100 },
      phone: { max: 20 },
      // Admin accounts are never self-service.
      role: { oneOf: ['customer', 'agent'], default: 'customer' },
      vehicleType: { oneOf: VEHICLES, default: 'motorbike' },
    });
    input.phone = normalizeBdPhone(input.phone);
    if (input.role === 'agent' && !input.phone) throw badRequest('Validation failed', { phone: 'is required for delivery agents' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(input.email)) throw conflict('An account with that email already exists');
    const hash = bcrypt.hashSync(input.password, 10);
    const user = tx(db, () => {
      const { lastInsertRowid: id } = db
        .prepare('INSERT INTO users (name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(input.name, input.email, input.phone || null, hash, input.role, now());
      if (input.role === 'agent') db.prepare('INSERT INTO agents (user_id, vehicle_type) VALUES (?, ?)').run(id, input.vehicleType);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  });

  r.post('/login', (req, res) => {
    const { email, password } = validate(req.body, { email: { required: true }, password: { required: true } });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) throw new HttpError(401, 'Incorrect email or password');
    if (!user.is_active) throw new HttpError(403, 'This account has been disabled. Contact an administrator.');
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  r.get('/me', authenticate(db), (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: publicUser(user) });
  });

  r.patch('/me', authenticate(db), (req, res) => {
    const input = validate(req.body, { name: { max: 80 }, phone: { max: 20 } });
    if (input.phone !== undefined) input.phone = normalizeBdPhone(input.phone);
    if (input.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(input.name, req.user.id);
    if (input.phone !== undefined) db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(input.phone, req.user.id);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  });

  return r;
}
