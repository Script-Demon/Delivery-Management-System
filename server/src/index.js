import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { createRealtime } from './realtime.js';
import { seedIfEmpty } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const DB_FILE = process.env.DB_FILE || path.join(here, '..', 'data.sqlite');

const db = openDb(DB_FILE);
seedIfEmpty(db);

const { io, notifier } = createRealtime(db);
const app = createApp(db, notifier, { staticDir: path.join(here, '..', '..', 'client', 'dist') });
const server = http.createServer(app);
io.attach(server);

server.listen(PORT, () => console.log(`Delivery Management API on http://localhost:${PORT}`));
