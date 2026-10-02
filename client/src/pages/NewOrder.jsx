import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Marker, Polyline } from 'react-leaflet';
import { api, errorText, useApi } from '../api.js';
import { useSession } from '../session.jsx';
import { Empty, Spinner } from '../components/ui.jsx';
import { BaseMap, pickupIcon, dropoffIcon } from '../components/MapView.jsx';
import { money, PACKAGE_ICONS } from '../format.js';

const TYPES = [
  ['food', 'Food', 'Meals & groceries'],
  ['parcel', 'Parcel', 'Boxes & documents'],
  ['product', 'Product', 'Retail items'],
];

export default function NewOrder() {
  const { user, markOwnAction } = useSession();
  const navigate = useNavigate();
  const addresses = useApi('/addresses');
  const [form, setForm] = useState({
    pickupAddressId: '', dropoffAddressId: '', packageType: 'food', description: '',
    weightKg: 1, priority: 'standard', recipientName: user.name, recipientPhone: '',
  });
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Preselect: default address as drop-off, another as pickup.
  useEffect(() => {
    const items = addresses.data?.items;
    if (!items?.length || form.dropoffAddressId) return;
    const def = items.find((a) => a.isDefault) || items[0];
    const other = items.find((a) => a.id !== def.id);
    setForm((f) => ({ ...f, dropoffAddressId: def.id, pickupAddressId: other?.id ?? '' }));
  }, [addresses.data]);

  // Live price quote.
  useEffect(() => {
    const { pickupAddressId, dropoffAddressId, packageType, weightKg, priority } = form;
    if (!pickupAddressId || !dropoffAddressId || pickupAddressId === dropoffAddressId) { setQuote(null); return; }
    const t = setTimeout(() => {
      api('/orders/quote', { method: 'POST', body: { pickupAddressId, dropoffAddressId, packageType, weightKg, priority } })
        .then(setQuote)
        .catch(() => setQuote(null));
    }, 200);
    return () => clearTimeout(t);
  }, [form.pickupAddressId, form.dropoffAddressId, form.packageType, form.weightKg, form.priority]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      markOwnAction();
      const order = await api('/orders', { method: 'POST', body: form });
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  if (addresses.loading) return <Spinner />;
  const items = addresses.data.items;
  if (items.length < 2) {
    return (
      <div className="page">
        <h1>New delivery</h1>
        <div className="card">
          <Empty icon="📍" title="Add your addresses first">
            You need at least two saved addresses — one to pick up from and one to deliver to.
            <Link className="btn primary" to="/addresses">Manage addresses</Link>
          </Empty>
        </div>
      </div>
    );
  }
  const pickup = items.find((a) => a.id === Number(form.pickupAddressId));
  const dropoff = items.find((a) => a.id === Number(form.dropoffAddressId));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>New delivery</h1>
          <p>Choose where we collect from, where it goes, and what we're carrying.</p>
        </div>
      </div>
      <form className="grid grid-main" onSubmit={submit}>
        <div className="stack">
          <div className="card stack">
            <h2>Route</h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="pickup">Pickup from</label>
                <select id="pickup" className="input" required value={form.pickupAddressId} onChange={(e) => set('pickupAddressId', Number(e.target.value))}>
                  <option value="">Select address…</option>
                  {items.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.line}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="dropoff">Deliver to</label>
                <select id="dropoff" className="input" required value={form.dropoffAddressId} onChange={(e) => set('dropoffAddressId', Number(e.target.value))}>
                  <option value="">Select address…</option>
                  {items.map((a) => <option key={a.id} value={a.id} disabled={a.id === Number(form.pickupAddressId)}>{a.label} — {a.line}</option>)}
                </select>
              </div>
            </div>
            <BaseMap className="map short" fitPoints={[pickup && [pickup.lat, pickup.lng], dropoff && [dropoff.lat, dropoff.lng]]}>
              {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />}
              {dropoff && <Marker position={[dropoff.lat, dropoff.lng]} icon={dropoffIcon} />}
              {pickup && dropoff && <Polyline positions={[[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]]} pathOptions={{ color: '#898781', weight: 2, dashArray: '6 6' }} />}
            </BaseMap>
            <p className="small muted">Missing an address? <Link to="/addresses">Add one</Link>.</p>
          </div>

          <div className="card stack">
            <h2>Package</h2>
            <div className="choice-grid">
              {TYPES.map(([type, label, hint]) => (
                <button type="button" key={type} className={`choice ${form.packageType === type ? 'on' : ''}`} onClick={() => set('packageType', type)}>
                  <span className="big" aria-hidden>{PACKAGE_ICONS[type]}</span>
                  <b>{label}</b>
                  <span className="muted small">{hint}</span>
                </button>
              ))}
            </div>
            <div className="field">
              <label htmlFor="desc">What are we delivering?</label>
              <input id="desc" className="input" required maxLength={200} placeholder="e.g. Kacchi biryani x2, borhani" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="weight">Weight (kg)</label>
                <input id="weight" className="input" type="number" min="0.1" max="50" step="0.1" value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
                <span className="hint">Items over 5 kg add a small surcharge.</span>
              </div>
              <div className="field">
                <span className="label">Speed</span>
                <div className="seg" role="radiogroup">
                  {[['standard', 'Standard'], ['express', 'Express ⚡']].map(([v, l]) => (
                    <button type="button" key={v} role="radio" aria-checked={form.priority === v} className={form.priority === v ? 'on' : ''} onClick={() => set('priority', v)}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card stack">
            <h2>Recipient</h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="rname">Name</label>
                <input id="rname" className="input" value={form.recipientName} onChange={(e) => set('recipientName', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="rphone">Phone</label>
                <input id="rphone" className="input" type="tel" placeholder="01XXXXXXXXX" value={form.recipientPhone} onChange={(e) => set('recipientPhone', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="card stack" style={{ position: 'sticky', top: 20 }}>
            <h2>Summary</h2>
            <dl className="kv">
              <dt>Pickup</dt><dd>{pickup?.label ?? '—'}</dd>
              <dt>Drop-off</dt><dd>{dropoff?.label ?? '—'}</dd>
              <dt>Distance</dt><dd className="num">{quote ? `${quote.distanceKm} km` : '—'}</dd>
              <dt>Est. time</dt><dd className="num">{quote ? `~${quote.etaMinutes} min` : '—'}</dd>
            </dl>
            <div className="divider" />
            <div className="spread">
              <span className="secondary">Delivery fee</span>
              <span className="stat-value num">{quote ? money(quote.fee) : '—'}</span>
            </div>
            {error && <div className="alert error">{error}</div>}
            <button className="btn primary lg block" disabled={busy || !quote}>{busy ? 'Placing order…' : 'Place order'}</button>
            <p className="small muted">You can cancel free of charge until the agent picks it up.</p>
          </div>
        </div>
      </form>
    </div>
  );
}
