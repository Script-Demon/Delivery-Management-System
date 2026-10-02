import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { allowedNext, assertTransition } from '../src/workflow.js';
import { quote } from '../src/pricing.js';

let server;
let base;
const db = openDb(':memory:');

before(async () => {
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

async function call(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

let phoneSeq = 0;
async function register(name, email, role = 'customer') {
  const phone = `017${String(++phoneSeq).padStart(8, '0')}`;
  const { status, body } = await call('POST', '/auth/register', null, { name, email, password: 'secret123', role, phone });
  assert.equal(status, 201, JSON.stringify(body));
  return body;
}

test('workflow rules', () => {
  assert.deepEqual(allowedNext('pending', 'customer'), ['cancelled']);
  assert.deepEqual(allowedNext('in_transit', 'agent').sort(), ['delivered', 'failed']);
  assert.throws(() => assertTransition('pending', 'delivered', 'agent'), /Cannot move/);
  assert.throws(() => assertTransition('picked_up', 'cancelled', 'customer'), /Cannot move/);
  assert.throws(() => assertTransition('assigned', 'picked_up', 'customer'), /customer cannot/);
});

test('pricing grows with distance and express priority', () => {
  const near = quote({ pickupLat: 23.75, pickupLng: 90.39, dropoffLat: 23.76, dropoffLng: 90.39, packageType: 'food' });
  const far = quote({ pickupLat: 23.75, pickupLng: 90.39, dropoffLat: 23.80, dropoffLng: 90.39, packageType: 'food' });
  const express = quote({ pickupLat: 23.75, pickupLng: 90.39, dropoffLat: 23.76, dropoffLng: 90.39, packageType: 'food', priority: 'express' });
  assert.ok(far.fee > near.fee);
  assert.ok(express.fee > near.fee);
  assert.ok(near.distanceKm > 1 && near.distanceKm < 2);
  assert.ok(Number.isInteger(near.fee), 'fees are whole taka');
  assert.ok(near.fee >= 40 && near.fee < 100, `food fee for ~1.4 km should be a few dozen taka, got ${near.fee}`);
});

test('Bangladeshi phone numbers are validated and normalized', async () => {
  const ok = await call('POST', '/auth/register', null, { name: 'Phone Test', email: 'phone@test.com', password: 'secret123', phone: '+880 1712-345678' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.phone, '+8801712345678');
  const bad = await call('POST', '/auth/register', null, { name: 'Bad Phone', email: 'badphone@test.com', password: 'secret123', phone: '0212345678' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.details.phone, /Bangladeshi/);
  const noPhoneAgent = await call('POST', '/auth/register', null, { name: 'No Phone', email: 'nophone@test.com', password: 'secret123', role: 'agent' });
  assert.equal(noPhoneAgent.status, 400);
});

test('full delivery lifecycle with permissions', async () => {
  const { token: cust } = await register('Cara Customer', 'cara@test.com');
  const { token: other } = await register('Otto Other', 'otto@test.com');
  const { token: agentTok, user: agent } = await register('Andy Agent', 'andy@test.com', 'agent');
  const { token: agent2Tok, user: agent2 } = await register('Bea Agent', 'bea@test.com', 'agent');

  // Admins cannot self-register.
  const sneaky = await call('POST', '/auth/register', null, { name: 'x', email: 'x@test.com', password: 'secret123', role: 'admin' });
  assert.equal(sneaky.status, 400);
  db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run('otto@test.com');
  const { body: { token: admin } } = await call('POST', '/auth/login', null, { email: 'otto@test.com', password: 'secret123' });

  const home = (await call('POST', '/addresses', cust, { label: 'Home', line: 'House 1, Road 2, Banani', city: 'Dhaka', lat: 23.79, lng: 90.40 })).body;
  const shop = (await call('POST', '/addresses', cust, { label: 'Shop', line: 'Road 27, Dhanmondi', city: 'Dhaka', lat: 23.75, lng: 90.37 })).body;
  assert.equal(home.isDefault, true, 'first address becomes default');

  const bad = await call('POST', '/orders', cust, { pickupAddressId: shop.id, dropoffAddressId: shop.id, packageType: 'food', description: 'x' });
  assert.equal(bad.status, 400);

  const created = await call('POST', '/orders', cust, { pickupAddressId: shop.id, dropoffAddressId: home.id, packageType: 'food', description: 'Noodles' });
  assert.equal(created.status, 201);
  const order = created.body;
  assert.equal(order.status, 'pending');
  assert.match(order.code, /^DLV-\d{6}$/);
  assert.equal(order.events.length, 1);

  // Agents can't see unassigned orders; customers can't assign.
  assert.equal((await call('GET', `/orders/${order.id}`, agentTok)).status, 404);
  assert.equal((await call('POST', `/orders/${order.id}/assign`, cust, { agentId: agent.id })).status, 403);

  // Auto-assign needs an online agent.
  assert.equal((await call('POST', `/orders/${order.id}/auto-assign`, admin)).status, 409);
  await call('PATCH', '/agents/me', agentTok, { availability: 'online' });
  const auto = await call('POST', `/orders/${order.id}/auto-assign`, admin);
  assert.equal(auto.status, 200);
  assert.equal(auto.body.agent.id, agent.id);

  // Agent rejects -> back to pending, then admin assigns agent 2.
  const rejected = await call('POST', `/orders/${order.id}/status`, agentTok, { status: 'pending', note: 'Flat tyre' });
  assert.equal(rejected.body.status, "pending", JSON.stringify(rejected.body));
  assert.equal(rejected.body.agent, null);
  assert.equal((await call('POST', `/orders/${order.id}/assign`, admin, { agentId: agent2.id })).body.status, 'assigned');

  // Can't skip steps.
  assert.equal((await call('POST', `/orders/${order.id}/status`, agent2Tok, { status: 'delivered' })).status, 409);
  await call('POST', `/orders/${order.id}/status`, agent2Tok, { status: 'picked_up' });
  // Customer can no longer cancel once picked up.
  assert.equal((await call('POST', `/orders/${order.id}/cancel`, cust)).status, 409);
  await call('POST', `/orders/${order.id}/status`, agent2Tok, { status: 'in_transit' });
  const done = await call('POST', `/orders/${order.id}/status`, agent2Tok, { status: 'delivered', note: 'At door' });
  assert.equal(done.body.status, 'delivered');
  assert.ok(done.body.deliveredAt);
  assert.deepEqual(done.body.events.map((e) => e.status), ['pending', 'assigned', 'pending', 'assigned', 'picked_up', 'in_transit', 'delivered']);

  const rated = await call('POST', `/orders/${order.id}/rate`, cust, { rating: 5, feedback: 'Great' });
  assert.equal(rated.body.rating, 5);
  assert.equal((await call('POST', `/orders/${order.id}/rate`, cust, { rating: 4 })).status, 409);

  const stats = await call('GET', '/stats/overview', admin);
  assert.equal(stats.body.totals.delivered, 1);
  assert.equal(stats.body.daily.length, 14);
  assert.equal((await call('GET', '/stats/overview', cust)).status, 403);

  const agentStats = await call('GET', '/stats/agent', agent2Tok);
  assert.equal(agentStats.body.delivered, 1);

  // History is scoped per user.
  assert.equal((await call('GET', '/orders', cust)).body.total, 1);
  assert.equal((await call('GET', '/orders', agentTok)).body.total, 0);
  assert.equal((await call('GET', '/orders?scope=closed', agent2Tok)).body.total, 1);
});

test('agent capacity is enforced', async () => {
  const { token: cust } = await register('Cap Customer', 'cap@test.com');
  const { user: agent } = await register('Cap Agent', 'capagent@test.com', 'agent');
  db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run('cap@test.com');
  const a = (await call('POST', '/addresses', cust, { label: 'A', line: 'a', city: 'c', lat: 1, lng: 1 })).body;
  const b = (await call('POST', '/addresses', cust, { label: 'B', line: 'b', city: 'c', lat: 1.01, lng: 1 })).body;
  db.prepare("UPDATE users SET role = 'customer' WHERE email = ?").run('cap@test.com');
  const ids = [];
  for (let i = 0; i < 4; i++) {
    ids.push((await call('POST', '/orders', cust, { pickupAddressId: a.id, dropoffAddressId: b.id, packageType: 'parcel', description: `p${i}` })).body.id);
  }
  const { token: admin } = (await call('POST', '/auth/login', null, { email: 'otto@test.com', password: 'secret123' })).body;
  for (let i = 0; i < 3; i++) assert.equal((await call('POST', `/orders/${ids[i]}/assign`, admin, { agentId: agent.id })).status, 200);
  const over = await call('POST', `/orders/${ids[3]}/assign`, admin, { agentId: agent.id });
  assert.equal(over.status, 409);
  assert.match(over.body.error, /already has 3/);
});
