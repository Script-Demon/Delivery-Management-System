import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, tx } from './db.js';
import { createOrder, assignOrder, changeStatus, rateOrder } from './orders.js';

// Demo city: Dhaka. Agents start scattered around Gulshan/Banani/Tejgaon.
const CENTER = { lat: 23.7808, lng: 90.4005 };

function rng(seed) {
  // mulberry32 — deterministic so every fresh install gets the same demo data.
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = [
  ['Nusrat Jahan', 'customer@demo.com', '+8801711000101'],
  ['Rafiqul Islam', 'rafiq@demo.com', '+8801811000102'],
  ['Farhana Akter', 'farhana@demo.com', '+8801911000103'],
  ['Sadia Rahman', 'sadia@demo.com', '+8801611000104'],
];
const AGENTS = [
  ['Rakib Hasan', 'agent@demo.com', 'motorbike', 'online'],
  ['Sumon Mia', 'sumon.agent@demo.com', 'bicycle', 'online'],
  ['Jahid Hossain', 'jahid.agent@demo.com', 'motorbike', 'online'],
  ['Mitu Akter', 'mitu.agent@demo.com', 'bicycle', 'offline'],
  ['Kamal Uddin', 'kamal.agent@demo.com', 'van', 'offline'],
];
// [label, street address, area, lat, lng]
const PLACES = [
  ['Home', 'House 12, Road 11', 'Banani', 23.7937, 90.4066],
  ['Office', 'Gulshan Avenue, Gulshan 2', 'Gulshan', 23.7948, 90.4143],
  ['Parents', 'House 45, Road 27', 'Dhanmondi', 23.7550, 90.3740],
  ['Kacchi Ghar', 'Satmasjid Road', 'Dhanmondi', 23.7465, 90.3760],
  ['Bashundhara City', 'Panthapath', 'Kawran Bazar', 23.7509, 90.3907],
  ['Pharmacy', 'Mirpur 10 Circle', 'Mirpur', 23.8069, 90.3687],
  ['Studio', 'Sector 7, Road 18', 'Uttara', 23.8728, 90.3984],
  ['Bank Office', 'Dilkusha C/A', 'Motijheel', 23.7330, 90.4172],
  ['Jamuna Future Park', 'Pragati Sarani, Kuril', 'Baridhara', 23.8135, 90.4243],
  ['Friend', 'Mohakhali DOHS, Road 5', 'Mohakhali', 23.7828, 90.3960],
];
const ITEMS = {
  food: ['Kacchi biryani x2', 'Fuchka & chotpoti', 'Beef tehari', 'Bhuna khichuri for 3', 'Mishti doi + roshogolla'],
  parcel: ['Documents envelope', 'Saree gift box', 'Return package', 'Mobile phone box', 'Books parcel'],
  product: ['Pharmacy order', 'Grocery bag (chal, dal, tel)', 'Phone charger', 'Eid panjabi', 'Flower bouquet'],
};
const FEEDBACK = ['Khub fast delivery!', 'Friendly and careful', 'Arrived a bit late due to traffic', 'Great service, dhonnobad', null, null];
const FAIL_REASONS = ['Recipient not reachable by phone', 'Could not find the house', 'Package refused at door'];
const DHAKA_OFFSET_MS = 6 * 3600000;

export function seed(db) {
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const jitter = (spread = 0.03) => ({ lat: CENTER.lat + (rand() - 0.5) * spread, lng: CENTER.lng + (rand() - 0.5) * spread * 1.3 });
  const hash = (pw) => bcrypt.hashSync(pw, 8);
  const insertUser = db.prepare('INSERT INTO users (name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const start = Date.now() - 15 * 86400000;
  const iso = (ms) => new Date(ms).toISOString();

  const customers = [];
  const agents = [];
  tx(db, () => {
    insertUser.run('Dispatch Admin', 'admin@demo.com', '+8801700000100', hash('admin123'), 'admin', iso(start));
    for (const [name, email, phone] of CUSTOMERS) {
      const { lastInsertRowid: id } = insertUser.run(name, email, phone, hash('customer123'), 'customer', iso(start));
      customers.push({ id: Number(id), role: 'customer', name });
      const places = [...PLACES].sort(() => rand() - 0.5).slice(0, 5);
      places.forEach(([label, line, area, lat, lng], i) => {
        db.prepare('INSERT INTO addresses (user_id, label, line, city, lat, lng, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, label, `${line}, ${area}`, 'Dhaka', lat + (rand() - 0.5) * 0.002, lng + (rand() - 0.5) * 0.002, i === 0 ? 1 : 0, iso(start));
      });
    }
    for (const [name, email, vehicle, availability] of AGENTS) {
      const { lastInsertRowid: id } = insertUser.run(name, email, '+88017220002' + String(agents.length).padStart(2, '0'), hash('agent123'), 'agent', iso(start));
      const p = jitter(0.04);
      db.prepare('INSERT INTO agents (user_id, vehicle_type, availability, lat, lng, location_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, vehicle, availability, p.lat, p.lng, iso(Date.now()));
      agents.push({ id: Number(id), role: 'agent', name });
    }
  });

  const admin = { id: 1, role: 'admin', name: 'Dispatch Admin' };
  const addressIds = (customerId) => db.prepare('SELECT id FROM addresses WHERE user_id = ?').all(customerId).map((r) => r.id);

  function makeOrder(customer, createdMs) {
    const ids = addressIds(customer.id).sort(() => rand() - 0.5);
    const packageType = pick(['food', 'food', 'parcel', 'product']);
    return createOrder(db, customer, {
      pickupAddressId: ids[0],
      dropoffAddressId: ids[1],
      packageType,
      description: pick(ITEMS[packageType]),
      weightKg: Math.round((0.5 + rand() * (packageType === 'parcel' ? 9 : 3)) * 10) / 10,
      priority: rand() < 0.2 ? 'express' : 'standard',
      recipientName: customer.name,
    }, { createdAt: iso(createdMs) });
  }

  const minutes = (n) => n * 60000;

  // Historical orders between 10:00 and 22:00 Dhaka time over the past two weeks.
  for (let day = 14; day >= 1; day--) {
    const dayStart = new Date(Date.now() + DHAKA_OFFSET_MS - day * 86400000);
    dayStart.setUTCHours(10, 0, 0, 0);
    dayStart.setTime(dayStart.getTime() - DHAKA_OFFSET_MS);
    const count = 3 + Math.floor(rand() * 6);
    for (let i = 0; i < count; i++) {
      const customer = pick(customers);
      const agent = pick(agents);
      let t = dayStart.getTime() + rand() * 12 * 3600000;
      const id = makeOrder(customer, t);
      const roll = rand();
      if (roll < 0.08) {
        changeStatus(db, customer, id, 'cancelled', { note: 'Changed my mind', at: iso((t += minutes(3))) });
        continue;
      }
      assignOrder(db, admin, id, agent.id, { at: iso((t += minutes(2 + rand() * 8))) });
      changeStatus(db, agent, id, 'picked_up', { at: iso((t += minutes(5 + rand() * 15))) });
      changeStatus(db, agent, id, 'in_transit', { at: iso((t += minutes(1 + rand() * 3))) });
      if (roll < 0.13) {
        changeStatus(db, agent, id, 'failed', { note: pick(FAIL_REASONS), at: iso((t += minutes(10 + rand() * 20))) });
        continue;
      }
      changeStatus(db, agent, id, 'delivered', { note: 'Handed to recipient', at: iso((t += minutes(8 + rand() * 30))) });
      if (rand() < 0.75) rateOrder(db, customer, id, rand() < 0.7 ? 5 : rand() < 0.6 ? 4 : 3, pick(FEEDBACK));
    }
  }

  // Today: a live board with orders at every stage.
  const t0 = Date.now() - minutes(90);
  const today = (i) => t0 + minutes(i * 9);
  const [rakib, sumon, jahid] = agents;
  const plan = [
    ['delivered', sumon], ['delivered', jahid], ['in_transit', rakib], ['picked_up', sumon],
    ['assigned', rakib], ['assigned', jahid], ['pending'], ['pending'], ['pending'],
  ];
  plan.forEach(([target, agent], i) => {
    const customer = i < 3 ? customers[0] : customers[i % customers.length];
    let t = today(i);
    const id = makeOrder(customer, t);
    if (target === 'pending') return;
    assignOrder(db, admin, id, agent.id, { at: iso((t += minutes(2))) });
    if (target === 'assigned') return;
    changeStatus(db, agent, id, 'picked_up', { at: iso((t += minutes(6))) });
    if (target === 'picked_up') return;
    changeStatus(db, agent, id, 'in_transit', { at: iso((t += minutes(1))) });
    if (target === 'in_transit') return;
    changeStatus(db, agent, id, 'delivered', { note: 'Handed to the building guard', at: iso((t += minutes(14))) });
  });
}

export function seedIfEmpty(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return false;
  seed(db);
  console.log('Seeded demo data (admin@demo.com / admin123, agent@demo.com / agent123, customer@demo.com / customer123)');
  return true;
}

// `npm run seed` wipes the database file and reseeds it.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const db = openDb(process.env.DB_FILE || path.join(here, '..', 'data.sqlite'));
  for (const table of ['location_pings', 'order_events', 'orders', 'addresses', 'agents', 'users']) db.exec(`DELETE FROM ${table}`);
  db.exec('DELETE FROM sqlite_sequence');
  seedIfEmpty(db);
  db.close();
}
