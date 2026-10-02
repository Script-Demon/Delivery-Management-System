import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useSession, useSocketEvent } from '../session.jsx';
import { DEFAULT_CENTER } from './MapView.jsx';

/**
 * Shares the agent's position over the socket while they work.
 *   gps  - real browser geolocation (watchPosition)
 *   sim  - demo mode: drives toward the current job's pickup, then its drop-off
 * Lives at layout level so sharing keeps running while the agent navigates.
 */
const TrackerContext = createContext(null);

const STEP_METERS = 90;
const TICK_MS = 2000;

function moveToward(from, to, meters) {
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((from.lat * Math.PI) / 180);
  const dist = Math.hypot(dLat * mPerDegLat, dLng * mPerDegLng);
  if (dist <= meters) return { ...to, arrived: true };
  const f = meters / dist;
  return { lat: from.lat + dLat * f, lng: from.lng + dLng * f, arrived: false };
}

export function AgentTrackerProvider({ children }) {
  const { socket, toast } = useSession();
  const [mode, setMode] = useState('off');
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const pos = useRef(null);
  const jobs = useRef([]);
  const arrivedFor = useRef(new Set());

  const loadJobs = useCallback(async () => {
    try {
      const [me, active] = await Promise.all([api('/agents/me'), api('/orders?scope=active&pageSize=10')]);
      jobs.current = active.items.reverse(); // oldest first
      if (!pos.current && me.location) { pos.current = me.location; setPosition(me.location); }
    } catch { /* ignore; next tick retries */ }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);
  useSocketEvent('order:changed', loadJobs);

  const send = useCallback((p) => {
    pos.current = p;
    setPosition({ ...p, at: new Date().toISOString() });
    socket?.emit('agent:location', { lat: p.lat, lng: p.lng }, (res) => {
      if (res && !res.ok) setError(res.error);
    });
  }, [socket]);

  // Real GPS.
  useEffect(() => {
    if (mode !== 'gps') return;
    if (!navigator.geolocation) { setError('This browser cannot share location'); setMode('off'); return; }
    setError(null);
    const id = navigator.geolocation.watchPosition(
      (p) => send({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => { setError(e.message || 'Location permission denied'); setMode('off'); },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [mode, send]);

  // Simulated driving.
  useEffect(() => {
    if (mode !== 'sim') return;
    setError(null);
    const timer = setInterval(() => {
      const job = jobs.current[0];
      const here = pos.current || (job && job.pickup) || { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
      if (!job) return send(here);
      const target = job.status === 'assigned' ? job.pickup : job.dropoff;
      const next = moveToward(here, target, STEP_METERS);
      send(next);
      if (next.arrived && !arrivedFor.current.has(`${job.id}-${job.status}`)) {
        arrivedFor.current.add(`${job.id}-${job.status}`);
        toast(job.status === 'assigned' ? `Arrived at pickup for ${job.code}` : `Arrived at drop-off for ${job.code}`);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [mode, send, toast]);

  return <TrackerContext.Provider value={{ mode, setMode, position, error }}>{children}</TrackerContext.Provider>;
}

export const useTracker = () => useContext(TrackerContext);
