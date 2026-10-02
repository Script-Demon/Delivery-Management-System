import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Marker, Tooltip } from 'react-leaflet';
import { api, errorText, useApi } from '../api.js';
import { useSession, useSocketEvent } from '../session.jsx';
import { useTracker } from '../components/AgentTracker.jsx';
import { Empty, Spinner, Stat, Toggle } from '../components/ui.jsx';
import OrderCard from '../components/OrderCard.jsx';
import { BaseMap, agentIcon, pickupIcon, dropoffIcon } from '../components/MapView.jsx';
import { BarChart, shortDay } from '../components/Charts.jsx';
import { money, takaShort, timeAgo } from '../format.js';

const NEXT_ACTION = {
  assigned: ['picked_up', '📦 Confirm pickup'],
  picked_up: ['in_transit', '🛵 Start delivery'],
  in_transit: ['delivered', '✓ Mark delivered'],
};

export default function AgentJobs() {
  const { toast, markOwnAction } = useSession();
  const tracker = useTracker();
  const me = useApi('/agents/me');
  const jobs = useApi('/orders?scope=active&pageSize=10');
  const stats = useApi('/stats/agent');
  useSocketEvent('order:changed', () => { jobs.reload(); stats.reload(); me.reload(); });

  async function setOnline(on) {
    try {
      const agent = await api('/agents/me', { method: 'PATCH', body: { availability: on ? 'online' : 'offline' } });
      me.setData(agent);
      if (!on) tracker.setMode('off');
      toast(on ? "You're online — dispatch can assign you jobs" : "You're offline — no new jobs will be assigned");
    } catch (err) {
      toast(errorText(err), 'warn');
    }
  }

  async function advance(order) {
    const [status, label] = NEXT_ACTION[order.status];
    try {
      markOwnAction();
      await api(`/orders/${order.id}/status`, { method: 'POST', body: { status } });
      toast(`${order.code}: ${label.replace(/^\S+\s/, '')}`);
      jobs.reload();
      stats.reload();
    } catch (err) {
      toast(errorText(err), 'warn');
    }
  }

  if (me.loading || jobs.loading || stats.loading) return <Spinner />;
  const agent = me.data;
  const online = agent.availability === 'online';
  const s = stats.data;
  const pos = tracker.position;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My jobs</h1>
          <p>{jobs.data.items.length ? `${jobs.data.items.length} active of ${agent.capacity} max` : online ? 'Waiting for dispatch to assign you a job.' : 'Go online to start receiving jobs.'}</p>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card spread">
          <div>
            <h2>{online ? '🟢 Online' : '⚪ Offline'}</h2>
            <p className="secondary small">{online ? 'Available for new deliveries' : 'Not receiving new jobs'}</p>
          </div>
          <Toggle on={online} onChange={setOnline} label="Online" />
        </div>
        <div className="card stack-sm">
          <div className="spread">
            <div>
              <h2>Location sharing</h2>
              <p className="secondary small">
                {tracker.mode === 'off' ? 'Customers and dispatch can’t see you on the map' : pos?.at ? `Last sent ${timeAgo(pos.at)}` : 'Starting…'}
              </p>
            </div>
            <div className="seg" role="radiogroup" aria-label="Location sharing">
              {[['off', 'Off'], ['gps', 'GPS'], ['sim', 'Simulate']].map(([m, l]) => (
                <button key={m} role="radio" aria-checked={tracker.mode === m} disabled={m !== 'off' && !online} className={tracker.mode === m ? 'on' : ''} onClick={() => tracker.setMode(m)}>{l}</button>
              ))}
            </div>
          </div>
          {tracker.mode === 'sim' && <span className="small muted">Demo mode: your marker drives toward the current job’s pickup, then its drop-off.</span>}
          {tracker.error && <div className="alert error">{tracker.error}</div>}
        </div>
      </div>

      <div className="grid grid-4">
        <Stat label="Delivered today" value={s.today.delivered} sub={`${money(s.today.earnings)} earned`} />
        <Stat label="Total deliveries" value={s.delivered} sub={`${s.failed} failed`} />
        <Stat label="Total earnings" value={money(s.earnings)} sub={`${s.distanceKm} km driven`} />
        <Stat label="Average rating" value={s.avgRating ? `${s.avgRating.toFixed(1)} ★` : '—'} />
      </div>

      <div className="grid grid-main">
        <section className="stack">
          <h2>Active jobs</h2>
          {jobs.data.items.length === 0 ? (
            <div className="card"><Empty icon="🛵" title="No active jobs">{online ? 'New assignments appear here instantly.' : 'You are offline.'}</Empty></div>
          ) : (
            jobs.data.items.map((o) => (
              <OrderCard key={o.id} order={o} showEarning>
                <div className="spread">
                  <span className="small secondary">
                    {o.status === 'assigned' ? `Head to pickup: ${o.pickup.label}` : `Deliver to ${o.recipient.name}${o.recipient.phone ? ` · ${o.recipient.phone}` : ''}`}
                  </span>
                  <div className="row">
                    <Link className="btn sm" to={`/orders/${o.id}`}>Details</Link>
                    <button className={`btn sm ${o.status === 'in_transit' ? 'good' : 'primary'}`} onClick={() => advance(o)}>{NEXT_ACTION[o.status][1]}</button>
                  </div>
                </div>
              </OrderCard>
            ))
          )}
        </section>
        <section className="stack">
          <h2>Map</h2>
          <BaseMap
            className="map"
            fitKey={jobs.data.items.map((o) => o.id).join(',') + (pos ? 'p' : '')}
            fitPoints={[pos && [pos.lat, pos.lng], ...jobs.data.items.flatMap((o) => [[o.pickup.lat, o.pickup.lng], [o.dropoff.lat, o.dropoff.lng]])]}
          >
            {jobs.data.items.map((o) => (
              <Fragment key={o.id}>
                <Marker position={[o.pickup.lat, o.pickup.lng]} icon={pickupIcon}><Tooltip>{o.code} pickup · {o.pickup.label}</Tooltip></Marker>
                <Marker position={[o.dropoff.lat, o.dropoff.lng]} icon={dropoffIcon}><Tooltip>{o.code} drop-off · {o.dropoff.label}</Tooltip></Marker>
              </Fragment>
            ))}
            {pos && <Marker position={[pos.lat, pos.lng]} icon={agentIcon(agent.vehicleType, { live: tracker.mode !== 'off' })} zIndexOffset={1000}><Tooltip>You</Tooltip></Marker>}
          </BaseMap>
          <div className="card">
            <div className="card-head"><h2>Earnings, last 14 days</h2></div>
            <BarChart
              data={s.daily}
              series={[{ key: 'earnings', label: 'Earnings', color: 'var(--series-1)' }]}
              formatX={shortDay}
              formatY={takaShort}
              labelEvery={3}
              height={180}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
