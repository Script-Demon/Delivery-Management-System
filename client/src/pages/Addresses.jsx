import { useState } from 'react';
import { Marker } from 'react-leaflet';
import { api, errorText, useApi } from '../api.js';
import { useSession } from '../session.jsx';
import { Empty, Spinner } from '../components/ui.jsx';
import { BaseMap, dropoffIcon, DEFAULT_CENTER } from '../components/MapView.jsx';

const blank = { label: '', line: '', city: 'Dhaka', notes: '', lat: null, lng: null, isDefault: false };

export default function Addresses() {
  const { toast } = useSession();
  const { data, loading, reload } = useApi('/addresses');
  const [editing, setEditing] = useState(null); // null | 'new' | address id
  const [form, setForm] = useState(blank);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const startNew = () => { setForm(blank); setEditing('new'); setError(null); };
  const startEdit = (a) => { setForm({ ...a, notes: a.notes || '' }); setEditing(a.id); setError(null); };

  function useMyLocation() {
    if (!navigator.geolocation) return setError('Your browser does not support location.');
    navigator.geolocation.getCurrentPosition(
      (p) => setForm((f) => ({ ...f, lat: p.coords.latitude, lng: p.coords.longitude })),
      () => setError('Could not get your location. Click the map instead.')
    );
  }

  async function save(e) {
    e.preventDefault();
    if (form.lat == null) return setError('Click the map to pin the exact location.');
    setBusy(true);
    setError(null);
    try {
      if (editing === 'new') await api('/addresses', { method: 'POST', body: form });
      else await api(`/addresses/${editing}`, { method: 'PUT', body: form });
      toast(editing === 'new' ? 'Address saved' : 'Address updated');
      setEditing(null);
      reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(a) {
    try {
      await api(`/addresses/${a.id}`, { method: 'DELETE' });
      toast(`Removed “${a.label}”`);
      if (editing === a.id) setEditing(null);
      reload();
    } catch (err) {
      toast(errorText(err), 'warn');
    }
  }

  async function makeDefault(a) {
    await api(`/addresses/${a.id}`, { method: 'PUT', body: { ...a, isDefault: true } });
    reload();
  }

  if (loading) return <Spinner />;
  const items = data.items;
  const pin = form.lat != null ? [form.lat, form.lng] : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Addresses</h1>
          <p>Saved places you can pick up from or deliver to. Orders keep their own copy, so editing never changes past deliveries.</p>
        </div>
        <button className="btn primary" onClick={startNew}>➕ Add address</button>
      </div>

      <div className="grid grid-main">
        <div className="stack">
          {items.length === 0 && (
            <div className="card"><Empty icon="📍" title="No saved addresses">Add your home, office or favorite stores.</Empty></div>
          )}
          {items.map((a) => (
            <div key={a.id} className="card spread">
              <div className="stack-sm grow">
                <div className="row wrap">
                  <b>{a.label}</b>
                  {a.isDefault && <span className="badge tone-info">Default</span>}
                </div>
                <span className="secondary">{a.line}, {a.city}</span>
                {a.notes && <span className="muted small">{a.notes}</span>}
              </div>
              <div className="row wrap">
                {!a.isDefault && <button className="btn sm ghost" onClick={() => makeDefault(a)}>Make default</button>}
                <button className="btn sm" onClick={() => startEdit(a)}>Edit</button>
                <button className="btn sm danger" onClick={() => remove(a)}>Delete</button>
              </div>
            </div>
          ))}
        </div>

        {editing && (
          <form className="card stack" onSubmit={save}>
            <div className="spread">
              <h2>{editing === 'new' ? 'New address' : 'Edit address'}</h2>
              <button type="button" className="btn sm ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
            {error && <div className="alert error">{error}</div>}
            <div className="field">
              <label htmlFor="label">Label</label>
              <input id="label" className="input" required maxLength={40} placeholder="Home, Office, Mayer bari…" value={form.label} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="line">House, road & area</label>
              <input id="line" className="input" required maxLength={160} placeholder="House 12, Road 11, Banani" value={form.line} onChange={(e) => set('line', e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="city">City</label>
                <input id="city" className="input" required maxLength={60} value={form.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="notes">Notes</label>
                <input id="notes" className="input" maxLength={200} placeholder="Flat 4B, near the mosque…" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <div className="spread">
                <span className="label">Pin location</span>
                <button type="button" className="btn sm ghost" onClick={useMyLocation}>📍 Use my location</button>
              </div>
              <BaseMap
                className="map short"
                center={pin || DEFAULT_CENTER}
                fitPoints={[pin]}
                fitKey={`${editing}-${pin ? 'pinned' : 'none'}`}
                onClick={({ lat, lng }) => setForm((f) => ({ ...f, lat, lng }))}
              >
                {pin && <Marker position={pin} icon={dropoffIcon} />}
              </BaseMap>
              <span className="hint">{pin ? `${form.lat.toFixed(5)}, ${form.lng.toFixed(5)} — click to move` : 'Click the map to drop a pin.'}</span>
            </div>
            <label className="row">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />
              Use as my default address
            </label>
            <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
