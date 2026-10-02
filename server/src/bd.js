import { badRequest } from './errors.js';

/** Bangladesh-specific settings shared across the API. */
export const TIMEZONE_OFFSET = '+6 hours'; // Asia/Dhaka, UTC+6 all year (no DST)
export const TIMEZONE_OFFSET_MS = 6 * 3600000;
export const VEHICLES = ['bicycle', 'motorbike', 'car', 'van'];

/**
 * Accepts Bangladeshi mobile numbers in any common form
 * (01712345678, 8801712345678, +880 1712-345678) and returns +8801XXXXXXXXX.
 */
export function normalizeBdPhone(value, field = 'phone') {
  if (value === undefined || value === null || value === '') return value || null;
  const digits = String(value).replace(/[\s\-()]/g, '').replace(/^\+/, '');
  const m = digits.match(/^(?:88)?(01[3-9]\d{8})$/);
  if (!m) throw badRequest('Validation failed', { [field]: 'must be a valid Bangladeshi mobile number (01XXXXXXXXX)' });
  return `+88${m[1]}`;
}
