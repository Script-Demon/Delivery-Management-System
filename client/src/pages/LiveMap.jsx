import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Marker, Polyline, Tooltip } from 'react-leaflet';
import { useApi } from '../api.js';
import { useSocketEvent } from '../session.jsx';
import { Spinner, StatusBadge } from '../components/ui.jsx';
import { BaseMap, agentIcon, pickupIcon, dropoffIcon } from '../components/MapView.jsx';
import { timeAgo } from '../format.js';

export default function LiveMap() {
  const agents = useApi('/agents');
  const orders = useApi('/orders?scope=open&pageSize=100');
  const [positions, setPositions] = useState({});
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    if (!agents.data) return;
    setPositions(Object.fromEntries(agents.data.items.filter((a) => a.location).map((a) => [a.id, a.location])));
  }, [agents.data]);

  useSocketEvent('agent:location', (p) => setPositions((s) => ({ ...s, [p.agentId]: p })));
  useSocketEvent('agent:changed', agents.reload);
  useSocketEvent('order:changed', () => { orders.reload(); agents.reload(); });

  if (agents.loading || orders.loading) return <Spinner />;
  const list = agents.data.items.filter((a) => a.isActive);
  const open = orders.data.items;
  const points = [
    ...Object.values(positions).map((p) => [p.lat, p.lng]),
    ...open.map((o) => [o.dropoff.lat, o.dropoff.lng]),
  ];
  const focusOrder = open.find((o) => o.id === focus);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Live map</h1>
          <p>Agent positions stream in real time. Click an order to highlight its route.</p>
        </div>
      </div>
      <div className="grid grid-main">
        <BaseMap className="map tall" fitPoints={points} fitKey={focus ? `f${focus}` : 'all'}>
          {list.map((a) => positions[a.id] && (
            <Marker key={a.id} position={[positions[a.id].lat, positions[a.id].lng]} icon={agentIcon(a.vehicleType, { live: a.activeOrders > 0, offline: a.availability === 'offline' })} zIndexOffset={1000}>
              <Tooltip>{a.name} · {a.availability} · {a.activeOrders} job(s) · {timeAgo(positions[a.id].at)}</Tooltip>
            </Marker>
          ))}
          {open.map((o) => (
            <Fragment key={o.id}>
              {(!focus || focus === o.id) && (
                <Marker position={[o.dropoff.lat, o.dropoff.lng]} icon={dropoffIcon} eventHandlers={{ click: () => setFocus(o.id) }}>
                  <Tooltip>{o.code} → {o.dropoff.label}</Tooltip>
                </Marker>
              )}
            </Fragment>
          ))}
          {focusOrder && (
            <>
              <Marker position={[focusOrder.pickup.lat, focusOrder.pickup.lng]} icon={pickupIcon}><Tooltip>{focusOrder.code} pickup</Tooltip></Marker>
              <Polyline positions={[[focusOrder.pickup.lat, focusOrder.pickup.lng], [focusOrder.dropoff.lat, focusOrder.dropoff.lng]]} pathOptions={{ color: '#2a78d6', weight: 3, dashArray: '6 6' }} />
            </>
          )}
        </BaseMap>
        <div className="stack">
          <div className="card stack-sm">
            <h2>Agents</h2>
            {list.map((a) => (
              <div className="spread" key={a.id}>
                <span>{a.name}</span>
                <span className="small muted">
                  {a.availability === 'online' ? `🟢 ${a.activeOrders}/${a.capacity} jobs` : '⚪ offline'}
                </span>
              </div>
            ))}
          </div>
          <div className="card stack-sm">
            <div className="spread">
              <h2>Open orders ({open.length})</h2>
              {focus && <button className="btn sm ghost" onClick={() => setFocus(null)}>Show all</button>}
            </div>
            {open.map((o) => (
              <button
                key={o.id}
                className={`choice ${focus === o.id ? 'on' : ''}`}
                onClick={() => setFocus(focus === o.id ? null : o.id)}
              >
                <span className="spread" style={{ width: '100%' }}>
                  <b>{o.code}</b>
                  <StatusBadge status={o.status} />
                </span>
                <span className="small secondary">{o.pickup.label} → {o.dropoff.label}</span>
                <span className="small muted">{o.agent ? o.agent.name : 'Unassigned'} · <Link to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()}>open</Link></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
