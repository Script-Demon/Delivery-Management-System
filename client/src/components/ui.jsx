import { STATUS_META, FLOW, PACKAGE_ICONS, dateTime } from '../format.js';
import { useSession } from '../session.jsx';

export function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, tone: 'neutral' };
  return (
    <span className={`badge tone-${m.tone}`}>
      <span className="dot" aria-hidden />
      {m.label}
    </span>
  );
}

export function PackageTag({ order }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <span aria-hidden>{PACKAGE_ICONS[order.packageType]}</span>
      <span className="secondary" style={{ textTransform: 'capitalize' }}>{order.packageType}</span>
      {order.priority === 'express' && <span className="pill express">Express</span>}
    </span>
  );
}

export function Route({ pickup, dropoff }) {
  return (
    <div className="route">
      <span className="pin p" aria-label="Pickup" />
      <div><b>{pickup.label}</b> <span className="muted">· {pickup.line}</span></div>
      <span className="line" />
      <span />
      <span className="pin d" aria-label="Drop-off" />
      <div><b>{dropoff.label}</b> <span className="muted">· {dropoff.line}</span></div>
    </div>
  );
}

export function Stepper({ status }) {
  if (status === 'cancelled' || status === 'failed') return null;
  const idx = FLOW.indexOf(status);
  return (
    <div className="stepper" aria-label={`Progress: ${STATUS_META[status].label}`}>
      {FLOW.map((s, i) => (
        <div key={s} className={`step ${i <= idx ? 'done' : ''} ${i === idx ? 'current' : ''}`}>
          <div className="bar" />
          <span>{STATUS_META[s].label}</span>
        </div>
      ))}
    </div>
  );
}

const TL_TONE = { good: 'tone-good', critical: 'tone-critical', warning: 'tone-warning', info: 'tone-info', neutral: 'tone-neutral' };

export function Timeline({ events }) {
  return (
    <ol className="timeline">
      {events.map((e) => {
        const m = STATUS_META[e.status];
        return (
          <li key={e.id}>
            <span className={`tl-dot ${TL_TONE[m.tone]}`} aria-hidden>{m.icon}</span>
            <div>
              <div className="spread">
                <b>{m.label}</b>
                <span className="muted small">{dateTime(e.createdAt)}</span>
              </div>
              {e.note && <div className="secondary">{e.note}</div>}
              <div className="muted small">{e.actorName ? `by ${e.actorName} (${e.actorRole})` : 'by the system'}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Stat({ label, value, sub }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export const Spinner = () => <div className="spinner" role="status" aria-label="Loading" />;

export function Empty({ icon = '📭', title, children }) {
  return (
    <div className="empty">
      <span className="big" aria-hidden>{icon}</span>
      <b style={{ color: 'var(--text)' }}>{title}</b>
      {children}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useSession();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <span>{t.message}</span>
          <button onClick={() => dismissToast(t.id)} aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`switch ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    />
  );
}
