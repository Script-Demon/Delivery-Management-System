import jwt from 'jsonwebtoken';
import { HttpError } from './errors.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TTL = '7d';

export const signToken = (user) => jwt.sign({ sub: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: TTL });

export function verifyToken(token) {
  const payload = jwt.verify(token, SECRET);
  return { id: payload.sub, role: payload.role, name: payload.name };
}

/** Express middleware: requires a valid bearer token for an active user. */
export function authenticate(db) {
  const findUser = db.prepare('SELECT id, role, name, is_active FROM users WHERE id = ?');
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new HttpError(401, 'Authentication required'));
    let claims;
    try {
      claims = verifyToken(token);
    } catch {
      return next(new HttpError(401, 'Session expired, please sign in again'));
    }
    const user = findUser.get(claims.id);
    if (!user || !user.is_active) return next(new HttpError(401, 'Account is disabled'));
    req.user = { id: user.id, role: user.role, name: user.name };
    next();
  };
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'You do not have access to this'));

export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  isActive: !!u.is_active,
  createdAt: u.created_at,
});
