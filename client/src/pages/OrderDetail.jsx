import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText, useApi } from '../api.js';
import { useSession, useSocketEvent } from '../session.jsx';
import { Empty, PackageTag, Spinner, StatusBadge, Stepper, Timeline } from '../components/ui.jsx';
import { OrderMap } from '../components/MapView.jsx';
import { dateTime, duration, money, timeAgo, VEHICLE_ICONS } from '../format.js';

const AGENT_ACTIONS = {
  picked_up: { label: '📦 Confirm pickup', cls: 'primary' },
  in_transit: { label: '🛵 Start delivery', cls: 'primary' },
  delivered: { label: '✓ Mark delivered', cls: 'good' },
  failed: { label: 'Report failed delivery', cls: 'danger', needsNote: true },
  pending: { label: 'Reject job', cls: 'danger', note: 'optional' },
};

export default function OrderDetail() {
  const { id } = useParams();
  const { user, socket, toast, markOwnAction } = useSession();
  const navigate = useNavigate();
  const { data: order, error, loading, reload, setData } = useApi(`/orders/${id}`);
  const [agentPos, setAgentPos] = useState(null);
  const [trail, setTrail] = useState([]);

  useEffect(() => {
    if (!order) return;
    setAgentPos(order.agent?.location ?? null);
    setTrail(order.trail);
  }, [order]);

  // Join this order's realtime room.
  useEffect(() => {
    if (!socket) return;
    const join = () => socket.emit('order:watch', id);
    join();
    socket.on('connect', join);
    return () => { socket.off('connect', join); socket.emit('order:unwatch', id); };
  }, [socket, id]);

  useSocketEvent('order:changed', (e) => { if (e.id === Number(id)) reload(); });
  useSocketEvent('agent:location', (p) => {
    if (!order?.agent || p.agentId !== order.agent.id || !p.orderIds?.includes(order.id)) return;
    setAgentPos(p);
    setTrail((t) => [...t, p]);
  });

  async function act(path, body, success) {
    try {
      markOwnAction();
      const updated = await api(`/orders/${id}/${path}`, { method: 'POST', body });
      if (success) toast(success);
      if (updated.events) setData(updated);
      else navigate(user.role === 'agent' ? '/jobs' : '/orders'); // released job: no longer visible to us
      return true;
    } catch (err) {
      toast(errorText(err), 'warn');
      if (err.status === 404) reload();
      return false;
    }
  }

  if (loading) return <Spinner />;
  if (error) {
    return (
      <div className="page">
        <div className="card"><Empty icon="🔍" title="Order not found">It may have been reassigned, or you don't have access. <Link to="/orders">Back to orders</Link></Empty></div>
      </div>
    );
  }

  const live = ['assigned', 'picked_up', 'in_transit'].includes(order.status);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="row wrap">
            <Link to="/orders" className="small">← Orders</Link>
          </div>
          <div className="row wrap" style={{ marginTop: 6 }}>
            <h1>{order.code}</h1>
            <StatusBadge status={order.status} />
            {order.priority === 'express' && <span className="pill express">Express</span>}
          </div>
          <p>Placed {dateTime(order.createdAt)} · {order.statusLabel}</p>
        </div>
      </div>

      <div className="card"><Stepper status={order.status} /></div>

      <div className="grid grid-main">
        <div className="stack">
          <div className="card stack">
            <div className="spread">
              <h2>Route</h2>
              {live && order.agent && (
                <span className="small muted">
                  {agentPos ? <>Agent location updated {timeAgo(agentPos.at)}</> : 'Waiting for the agent to share location'}
                </span>
              )}
            </div>
            <OrderMap order={order} agentPos={live ? agentPos : null} trail={trail} />
            <div className="grid grid-2">
              <div className="stack-sm">
                <span className="row"><span className="marker p" style={{ width: 18, height: 18, fontSize: 10 }}>P</span><b>Pickup · {order.pickup.label}</b></span>
                <span className="secondary">{order.pickup.line}</span>
              </div>
              <div className="stack-sm">
                <span className="row"><span className="marker d" style={{ width: 18, height: 18, fontSize: 10 }}>D</span><b>Drop-off · {order.dropoff.label}</b></span>
                <span className="secondary">{order.dropoff.line}</span>
                <span className="small muted">Recipient: {order.recipient.name}{order.recipient.phone && ` · ${order.recipient.phone}`}</span>
              </div>
            </div>
          </div>

          <Actions order={order} role={user.role} act={act} />

          <div className="card">
            <h2 style={{ marginBottom: 14 }}>History</h2>
            <Timeline events={order.events} />
          </div>
        </div>

        <div className="stack">
          <div className="card stack">
            <h2>Details</h2>
            <PackageTag order={order} />
            <div>{order.description}</div>
            <dl className="kv">
              <dt>Weight</dt><dd className="num">{order.weightKg} kg</dd>
              <dt>Distance</dt><dd className="num">{order.distanceKm} km</dd>
              <dt>{user.role === 'agent' ? 'Your earning' : 'Fee'}</dt><dd className="num">{money(user.role === 'agent' ? order.agentEarning : order.fee)}</dd>
              {user.role !== 'customer' && <><dt>Customer</dt><dd>{order.customer.name}{order.customer.phone && <div className="muted small">{order.customer.phone}</div>}</dd></>}
              {order.deliveredAt && <><dt>Delivered</dt><dd>{dateTime(order.deliveredAt)}</dd></>}
              {order.deliveredAt && <><dt>Total time</dt><dd>{duration(order.createdAt, order.deliveredAt)}</dd></>}
            </dl>
          </div>

          <div className="card stack">
            <h2>Delivery agent</h2>
            {order.agent ? (
              <div className="row">
                <span className="marker agent" style={{ width: 40, height: 40, fontSize: 20 }} aria-hidden>{VEHICLE_ICONS[order.agent.vehicleType]}</span>
                <div>
                  <b>{order.agent.name}</b>
                  <div className="muted small" style={{ textTransform: 'capitalize' }}>{order.agent.vehicleType}{order.agent.phone && ` · ${order.agent.phone}`}</div>
                </div>
              </div>
            ) : (
              <p className="muted">{order.status === 'pending' ? 'Not assigned yet — a dispatcher will assign an agent shortly.' : 'No agent.'}</p>
            )}
            {user.role === 'admin' && <AssignPanel order={order} act={act} />}
          </div>

          {order.status === 'delivered' && order.rating && (
            <div className="card stack-sm">
              <h2>Customer rating</h2>
              <div className="stars" aria-label={`${order.rating} out of 5`}>{[1, 2, 3, 4, 5].map((n) => <button key={n} className={n <= order.rating ? 'on' : ''} disabled>★</button>)}</div>
              {order.feedback && <p className="secondary">“{order.feedback}”</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Actions({ order, role, act }) {
  const [noteFor, setNoteFor] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const next = order.nextStatuses || [];

  const run = async (...args) => {
    setBusy(true);
    const ok = await act(...args);
    setBusy(false);
    if (ok) { setNoteFor(null); setNote(''); }
  };

  if (role === 'customer') {
    if (order.status === 'delivered' && !order.rating) return <RateCard act={act} />;
    if (!next.includes('cancelled')) return null;
    return (
      <div className="card spread">
        <div>
          <h3>Need to cancel?</h3>
          <p className="secondary small">You can cancel until the agent picks up the package.</p>
        </div>
        {noteFor === 'cancelled' ? (
          <div className="row wrap grow" style={{ justifyContent: 'flex-end' }}>
            <input className="input" style={{ maxWidth: 260 }} placeholder="Reason (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn ghost" onClick={() => setNoteFor(null)}>Keep order</button>
            <button className="btn danger" disabled={busy} onClick={() => run('cancel', { reason: note }, 'Order cancelled')}>Confirm cancel</button>
          </div>
        ) : (
          <button className="btn danger" onClick={() => setNoteFor('cancelled')}>Cancel order</button>
        )}
      </div>
    );
  }

  if (role === 'agent') {
    if (!next.length) return null;
    const primary = next.filter((s) => !AGENT_ACTIONS[s].note && !AGENT_ACTIONS[s].needsNote);
    const secondary = next.filter((s) => AGENT_ACTIONS[s].note || AGENT_ACTIONS[s].needsNote);
    return (
      <div className="card stack">
        <h2>Update delivery</h2>
        <div className="row wrap">
          {primary.map((s) => (
            <button key={s} className={`btn lg ${AGENT_ACTIONS[s].cls}`} disabled={busy} onClick={() => run('status', { status: s })}>{AGENT_ACTIONS[s].label}</button>
          ))}
          {secondary.map((s) => (
            <button key={s} className="btn danger" disabled={busy} onClick={() => setNoteFor(s)}>{AGENT_ACTIONS[s].label}</button>
          ))}
        </div>
        {noteFor && (
          <div className="stack-sm">
            <label className="label" htmlFor="note">{AGENT_ACTIONS[noteFor].needsNote ? 'What went wrong? (required)' : 'Reason (optional)'}</label>
            <textarea id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={noteFor === 'failed' ? 'Recipient not available, wrong address…' : 'Too far, vehicle issue…'} />
            <div className="row">
              <button className="btn ghost" onClick={() => setNoteFor(null)}>Back</button>
              <button className="btn danger" disabled={busy || (AGENT_ACTIONS[noteFor].needsNote && !note.trim())} onClick={() => run('status', { status: noteFor, note }, noteFor === 'pending' ? 'Job released back to dispatch' : 'Reported as failed')}>
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // admin
  const canFail = next.includes('failed');
  const canCancel = next.includes('cancelled');
  if (!canFail && !canCancel) return null;
  return (
    <div className="card stack">
      <h2>Dispatcher actions</h2>
      {noteFor ? (
        <div className="stack-sm">
          <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (shared with the customer)" />
          <div className="row">
            <button className="btn ghost" onClick={() => setNoteFor(null)}>Back</button>
            <button
              className="btn danger"
              disabled={busy || (noteFor === 'failed' && !note.trim())}
              onClick={() => noteFor === 'cancelled' ? run('cancel', { reason: note }, 'Order cancelled') : run('status', { status: 'failed', note }, 'Marked as failed')}
            >
              Confirm {noteFor === 'cancelled' ? 'cancellation' : 'failure'}
            </button>
          </div>
        </div>
      ) : (
        <div className="row wrap">
          {canCancel && <button className="btn danger" onClick={() => setNoteFor('cancelled')}>Cancel order</button>}
          {canFail && <button className="btn danger" onClick={() => setNoteFor('failed')}>Mark as failed</button>}
        </div>
      )}
    </div>
  );
}

function AssignPanel({ order, act }) {
  const canAssign = ['pending', 'assigned'].includes(order.status);
  const candidates = useApi(canAssign ? `/orders/${order.id}/candidates` : null);
  const agents = useApi(canAssign ? '/agents' : null);
  const [agentId, setAgentId] = useState('');
  if (!canAssign) return null;

  const best = candidates.data?.items.find((c) => c.id !== order.agent?.id);
  const refresh = () => { candidates.reload(); agents.reload(); };

  return (
    <div className="stack-sm">
      <div className="divider" />
      <span className="label">{order.agent ? 'Reassign' : 'Assign'}</span>
      {order.status === 'pending' && (
        <button className="btn primary" onClick={async () => { await act('auto-assign', undefined, 'Auto-assigned'); refresh(); }} disabled={!candidates.data?.items.length}>
          ⚡ Auto-assign{best ? ` → ${best.name}${best.distanceKm != null ? ` (${best.distanceKm.toFixed(1)} km)` : ''}` : ''}
        </button>
      )}
      {candidates.data && !candidates.data.items.length && <span className="small muted">No online agent has spare capacity.</span>}
      <div className="row">
        <select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">Choose an agent…</option>
          {agents.data?.items.filter((a) => a.isActive && a.id !== order.agent?.id).map((a) => (
            <option key={a.id} value={a.id} disabled={a.activeOrders >= a.capacity}>
              {a.name} — {a.availability} · {a.activeOrders}/{a.capacity}
            </option>
          ))}
        </select>
        <button className="btn" disabled={!agentId} onClick={async () => { if (await act('assign', { agentId: Number(agentId) }, 'Agent assigned')) { setAgentId(''); refresh(); } }}>Assign</button>
      </div>
      {order.status === 'assigned' && (
        <button className="btn sm ghost" onClick={() => act('status', { status: 'pending' }, 'Order unassigned')}>Unassign (back to queue)</button>
      )}
    </div>
  );
}

function RateCard({ act }) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  return (
    <div className="card stack">
      <div>
        <h2>How was your delivery?</h2>
        <p className="secondary small">Your rating helps us keep agents accountable.</p>
      </div>
      <div className="stars" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</button>
        ))}
      </div>
      <textarea className="input" placeholder="Anything to add? (optional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      <div><button className="btn primary" disabled={!rating} onClick={() => act('rate', { rating, feedback }, 'Thanks for your feedback!')}>Submit rating</button></div>
    </div>
  );
}
