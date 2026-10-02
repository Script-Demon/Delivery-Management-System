import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../api.js';
import { useSocketEvent } from '../session.jsx';
import { Spinner, Stat, StatusBadge } from '../components/ui.jsx';
import { BarChart, HBars, shortDay } from '../components/Charts.jsx';
import { money, takaShort, PACKAGE_ICONS, STATUS_META, timeAgo } from '../format.js';

export default function AdminDashboard() {
  const stats = useApi('/stats/overview');
  const queue = useApi('/orders?status=pending&pageSize=6');
  const [showTable, setShowTable] = useState(false);
  useSocketEvent('order:changed', () => { stats.reload(); queue.reload(); });
  useSocketEvent('agent:changed', () => stats.reload());

  if (stats.loading || queue.loading) return <Spinner />;
  const s = stats.data;
  const t = s.totals;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Operations at a glance — updates live as orders move.</p>
        </div>
        <div className="row wrap">
          <Link className="btn" to="/map">🗺️ Live map</Link>
          <Link className="btn primary" to="/orders?status=pending">Dispatch queue ({t.pending})</Link>
        </div>
      </div>

      <div className="grid grid-4">
        <Stat label="Orders today" value={s.today.orders} sub={`${s.today.delivered} delivered · ${money(s.today.revenue)}`} />
        <Stat label="In progress" value={t.active} sub={`${t.pending} waiting for an agent`} />
        <Stat label="Agents online" value={`${s.agents.online} / ${s.agents.total}`} sub="active accounts" />
        <Stat label="Success rate" value={t.successRate != null ? `${t.successRate}%` : '—'} sub="delivered ÷ attempted" />
      </div>
      <div className="grid grid-4">
        <Stat label="Total revenue" value={money(t.revenue)} sub={`${t.delivered} delivered orders`} />
        <Stat label="Avg. delivery time" value={t.avgDeliveryMinutes != null ? `${Math.round(t.avgDeliveryMinutes)} min` : '—'} sub="order placed → delivered" />
        <Stat label="Avg. rating" value={t.avgRating ? `${t.avgRating.toFixed(2)} ★` : '—'} />
        <Stat label="All-time orders" value={t.orders} />
      </div>

      <div className="grid grid-main">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Orders per day</h2>
              <p>Last 14 days, by outcome</p>
            </div>
            <button className="btn sm ghost" onClick={() => setShowTable((v) => !v)}>{showTable ? 'Show chart' : 'Show table'}</button>
          </div>
          {showTable ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Day</th><th className="right">Orders</th><th className="right">Delivered</th><th className="right">Failed / cancelled</th><th className="right">Revenue</th></tr></thead>
                <tbody>
                  {[...s.daily].reverse().map((d) => (
                    <tr key={d.day}><td>{shortDay(d.day, true)}</td><td className="right num">{d.orders}</td><td className="right num">{d.delivered}</td><td className="right num">{d.lost}</td><td className="right num">{money(d.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <BarChart
              data={s.daily.map((d) => ({ ...d, other: d.orders - d.delivered - d.lost }))}
              series={[
                { key: 'delivered', label: 'Delivered', color: 'var(--series-1)' },
                { key: 'other', label: 'In progress', color: 'var(--series-3)' },
                { key: 'lost', label: 'Failed / cancelled', color: 'var(--series-2)' },
              ]}
              formatX={shortDay}
              labelEvery={2}
            />
          )}
        </div>
        <div className="card">
          <div className="card-head"><div><h2>Revenue per day</h2><p>Delivered orders only</p></div></div>
          <BarChart
            data={s.daily}
            series={[{ key: 'revenue', label: 'Revenue', color: 'var(--series-1)' }]}
            formatX={shortDay}
            formatY={takaShort}
            labelEvery={3}
          />
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <div className="card-head"><h2>Status breakdown</h2></div>
          <div className="stack-sm">
            {Object.keys(STATUS_META).map((k) => (
              <div className="spread" key={k}>
                <StatusBadge status={k} />
                <b className="num">{s.byStatus[k] || 0}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>By package type</h2></div>
          <HBars items={s.byType.map((x) => ({ label: `${PACKAGE_ICONS[x.type]} ${x.type}`, value: x.n }))} />
          <div className="card-head" style={{ marginTop: 20 }}><div><h2>Busiest hours</h2><p>Orders placed by hour (Dhaka time)</p></div></div>
          <BarChart
            data={Array.from({ length: 24 }, (_, h) => ({ hour: h, n: s.byHour.find((x) => x.hour === h)?.n || 0 }))}
            series={[{ key: 'n', label: 'Orders', color: 'var(--series-1)' }]}
            xKey="hour"
            formatX={(h, long) => (long ? `${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59` : `${h}h`)}
            labelEvery={6}
            height={140}
          />
        </div>
        <div className="card">
          <div className="card-head"><h2>Top agents</h2></div>
          <div className="stack-sm">
            {s.topAgents.map((a, i) => (
              <div className="spread" key={a.id}>
                <span><span className="muted num">{i + 1}.</span> <b>{a.name}</b></span>
                <span className="small secondary num">{a.delivered} delivered · {a.avg_rating ? `${a.avg_rating.toFixed(1)}★` : '—'} · {Math.round(a.avg_trip_min)} min/trip</span>
              </div>
            ))}
            {!s.topAgents.length && <span className="muted">No deliveries yet.</span>}
          </div>
        </div>
      </div>

      <div className="card flush">
        <div className="card-head" style={{ padding: '16px 20px 0' }}>
          <div><h2>Waiting for assignment</h2><p>Oldest first at the bottom</p></div>
          <Link to="/orders?status=pending" className="small">Open dispatch queue →</Link>
        </div>
        {queue.data.items.length === 0 ? (
          <p className="muted" style={{ padding: '0 20px 20px' }}>All caught up — no pending orders.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {queue.data.items.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/orders/${o.id}`}><b>{o.code}</b></Link></td>
                    <td>{PACKAGE_ICONS[o.packageType]} {o.description}{o.priority === 'express' && <> <span className="pill express">Express</span></>}</td>
                    <td className="secondary">{o.pickup.label} → {o.dropoff.label}</td>
                    <td className="muted">{timeAgo(o.createdAt)}</td>
                    <td className="right"><Link className="btn sm" to={`/orders/${o.id}`}>Assign</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
