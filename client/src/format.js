// Bangladesh: Taka with lakh/crore digit grouping (e.g. ৳1,25,000) and Dhaka time.
export const TIME_ZONE = 'Asia/Dhaka';
const takaFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const money = (n) => (n == null ? '—' : `৳${takaFmt.format(Math.round(n))}`);
export const takaShort = (n) => `৳${takaFmt.format(Math.round(n))}`;

export const km = (n) => (n == null ? '—' : `${n.toFixed(1)} km`);

export function dateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return dateTime(iso);
}

export function duration(fromIso, toIso) {
  if (!fromIso || !toIso) return '—';
  const m = Math.round((new Date(toIso) - new Date(fromIso)) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const PACKAGE_ICONS = { food: '🍔', parcel: '📦', product: '🛍️' };
export const VEHICLE_ICONS = { bicycle: '🚲', motorbike: '🏍️', car: '🚗', van: '🚐' };

export const STATUS_META = {
  pending: { label: 'Pending', tone: 'warning', icon: '⏳' },
  assigned: { label: 'Assigned', tone: 'info', icon: '👤' },
  picked_up: { label: 'Picked up', tone: 'info', icon: '📦' },
  in_transit: { label: 'On the way', tone: 'info', icon: '🛵' },
  delivered: { label: 'Delivered', tone: 'good', icon: '✓' },
  failed: { label: 'Failed', tone: 'critical', icon: '!' },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: '✕' },
};

export const FLOW = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered'];
