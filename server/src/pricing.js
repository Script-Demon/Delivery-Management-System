const EARTH_RADIUS_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;

/** Great-circle distance between two points, in km. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Straight-line distance underestimates street distance; this is a common rule-of-thumb factor.
const ROAD_FACTOR = 1.3;
// All money is in Bangladeshi Taka (BDT), rounded to whole taka.
const BASE_FEE = { food: 40, parcel: 60, product: 50 };
const PER_KM = 15;
const PER_KG_OVER_5 = 10;
const EXPRESS_MULTIPLIER = 1.5;
// Typical average speed through Dhaka traffic.
const AVG_SPEED_KMH = 15;

export const AGENT_SHARE = 0.7;

export function quote({ pickupLat, pickupLng, dropoffLat, dropoffLng, packageType, weightKg = 1, priority = 'standard' }) {
  const distanceKm = haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng) * ROAD_FACTOR;
  let fee = BASE_FEE[packageType] + distanceKm * PER_KM + Math.max(0, weightKg - 5) * PER_KG_OVER_5;
  if (priority === 'express') fee *= EXPRESS_MULTIPLIER;
  const etaMinutes = Math.round((distanceKm / AVG_SPEED_KMH) * 60 + (priority === 'express' ? 10 : 20));
  return {
    distanceKm: round(distanceKm, 2),
    fee: Math.round(fee),
    etaMinutes,
  };
}

const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;
