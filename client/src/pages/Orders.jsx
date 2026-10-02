import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorText, useApi } from '../api.js';
import { useSession, useSocketEvent } from '../session.jsx';
import { Empty, PackageTag, Spinner, StatusBadge } from '../components/ui.jsx';
import { dateTime, money } from '../format.js';

const FILTERS = [
  ['', 'All'],
  ['pending', 'Pending'],
  ['assigned,picked_up,in_transit', 'In progress'],
  ['delivered', 'Delivered'],
  ['failed', 'Failed'],
  ['cancelled', 'Cancelled'],
];

const TITLES = { customer: 'My orders', agent: 'Delivery history', admin: 'Orders' };

export default function Orders() {
  const { user, toast, markOwnAction } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = Number(params.get('page')) || 1;
  const [q, setQ] = useState(params.get('q') || '');
  const isAdmin = user.role === 'admin';
  const filters = user.role === 'agent' ? FILTERS.filter(([v]) => v !== 'pending') : FILTERS;

  // Debounce the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => update({ q: q || null, page: null }), 300);
    return () => clearTimeout(t);
  }, [q]);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }

  const query = new URLSearchParams({ page, pageSize: 15, ...(status && { status }), ...(params.get('q') && { q: params.get('q') }) });
  const { data, loading, reload } = useApi(`/orders?${query}`);
  const agents = useApi(isAdmin ? '/agents' : null);
  useSocketEvent('order:changed', reload);

  async function assign(orderId, agentId) {
    try {
      markOwnAction();
      const o = await api(`/orders/${orderId}/assign`, { method: 'POST', body: { agentId: Number(agentId) } });
      toast(`${o.code} assigned to ${o.agent.name}`);
      reload();
      agents.reload();
    } catch (err) {
      toast(errorText(err), 'warn');
    }
  }

  async function autoAssignAll() {
    try {
      markOwnAction();
      const r = await api('/orders/auto-assign-all', { method: 'POST' });
      toast(r.assigned ? `Assigned ${r.assigned} order(s)${r.remaining ? `, ${r.remaining} still waiting for capacity` : ''}` : 'No online agent has capacity right now', r.assigned ? 'info' : 'warn');
      reload();
      agents.reload();
    } catch (err) {
      toast(errorText(err), 'warn');
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{TITLES[user.role]}</h1>
          <p>{data ? `${data.total} order${data.total === 1 ? '' : 's'}` : ' '}</p>
        </div>
        <div className="row wrap">
          {isAdmin && <button className="btn" onClick={autoAssignAll}>⚡ Auto-assign pending</button>}
          {user.role === 'customer' && <Link className="btn primary" to="/orders/new">➕ New delivery</Link>}
        </div>
      </div>

      <div className="spread">
        <div className="seg" role="tablist">
          {filters.map(([v, label]) => (
            <button key={label} role="tab" aria-selected={status === v} className={status === v ? 'on' : ''} onClick={() => update({ status: v || null, page: null })}>{label}</button>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 280 }} type="search" placeholder="Search code, item, recipient…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card flush">
        {loading && !data ? <Spinner /> : data.items.length === 0 ? (
          <Empty title="No orders match">Try a different filter or search.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Package</th>
                  {isAdmin && <th>Customer</th>}
                  <th>Drop-off</th>
                  <th>Status</th>
                  {user.role !== 'agent' && <th>Agent</th>}
                  <th>{user.role === 'agent' ? 'Completed' : 'Placed'}</th>
                  <th className="right">{user.role === 'agent' ? 'Earning' : 'Fee'}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => navigate(`/orders/${o.id}`)}>
                    <td><Link to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()}><b>{o.code}</b></Link></td>
                    <td>
                      <PackageTag order={o} />
                      <div className="muted small">{o.description}</div>
                    </td>
                    {isAdmin && <td>{o.customer.name}</td>}
                    <td><div>{o.dropoff.label}</div><div className="muted small">{o.dropoff.line}</div></td>
                    <td><StatusBadge status={o.status} /></td>
                    {user.role !== 'agent' && (
                      <td onClick={(e) => isAdmin && o.status === 'pending' && e.stopPropagation()}>
                        {isAdmin && o.status === 'pending' ? (
                          <select className="input" style={{ height: 32, minWidth: 150 }} defaultValue="" onChange={(e) => e.target.value && assign(o.id, e.target.value)}>
                            <option value="">Assign to…</option>
                            {agents.data?.items.filter((a) => a.isActive).map((a) => (
                              <option key={a.id} value={a.id} disabled={a.activeOrders >= a.capacity}>
                                {a.name} · {a.availability === 'online' ? `${a.activeOrders}/${a.capacity} jobs` : 'offline'}
                              </option>
                            ))}
                          </select>
                        ) : o.agent ? o.agent.name : <span className="muted">—</span>}
                      </td>
                    )}
                    <td className="muted">{dateTime(user.role === 'agent' ? o.closedAt || o.assignedAt : o.createdAt)}</td>
                    <td className="right num">{money(user.role === 'agent' ? o.agentEarning : o.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && pages > 1 && (
          <div className="pagination">
            <button className="btn sm" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>← Previous</button>
            <span className="muted small">Page {page} of {pages}</span>
            <button className="btn sm" disabled={page >= pages} onClick={() => update({ page: page + 1 })}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
