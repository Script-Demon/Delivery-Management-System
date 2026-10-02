export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do that') => new HttpError(403, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Minimal field validation: returns cleaned values or throws a 400 listing every problem. */
export function validate(body, rules) {
  const out = {};
  const errors = {};
  for (const [field, rule] of Object.entries(rules)) {
    let v = body?.[field];
    if (typeof v === 'string') v = v.trim();
    if (v === undefined || v === null || v === '') {
      if (rule.required) errors[field] = 'is required';
      else if (rule.default !== undefined) out[field] = rule.default;
      continue;
    }
    switch (rule.type) {
      case 'number':
      case 'int': {
        const n = Number(v);
        if (!Number.isFinite(n) || (rule.type === 'int' && !Number.isInteger(n))) { errors[field] = `must be a ${rule.type === 'int' ? 'whole ' : ''}number`; continue; }
        if (rule.min !== undefined && n < rule.min) { errors[field] = `must be at least ${rule.min}`; continue; }
        if (rule.max !== undefined && n > rule.max) { errors[field] = `must be at most ${rule.max}`; continue; }
        v = n;
        break;
      }
      case 'bool':
        v = v === true || v === 'true' || v === 1;
        break;
      default:
        v = String(v);
        if (rule.max && v.length > rule.max) { errors[field] = `must be at most ${rule.max} characters`; continue; }
        if (rule.min && v.length < rule.min) { errors[field] = `must be at least ${rule.min} characters`; continue; }
        if (rule.pattern && !rule.pattern.test(v)) { errors[field] = rule.message || 'is invalid'; continue; }
    }
    if (rule.oneOf && !rule.oneOf.includes(v)) { errors[field] = `must be one of: ${rule.oneOf.join(', ')}`; continue; }
    out[field] = v;
  }
  if (Object.keys(errors).length) throw badRequest('Validation failed', errors);
  return out;
}
