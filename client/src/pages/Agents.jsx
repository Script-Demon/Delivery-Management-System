import { api, errorText, useApi } from '../api.js';
import { useSession, useSocketEvent } from '../session.jsx';
import { Empty, Spinner, Toggle } from '../components/ui.jsx';
import { money, timeAgo, VEHICLE_ICONS } from '../format.js';

const WORK_STATE = {
  idle: ['Available', 'tone-good'],
  on_delivery: ['On delivery', 'tone-info'],
  busy: ['At capacity', 'tone-warning'],
  offline: ['Offline', 'tone-neutral'],
};

export default function Agents() {
  const { toast } = useSession();
  const { data, loading, reload } = useApi('/agents');
  useSocketEvent('agent:changed', reload);
  useSocketEvent('order:changed', reload);

  async function setActive(agent, isActive) {
    try {
      await api(`/agents/${agent.id}`, { method: 'PATCH', body: { isActive } });
      toast(`${agent.name} ${isActive ? 'reactivated' : 'deactivated'}`);
      reload();
    } catch (err) {
      toast(errorText(err), 'warn');
    }
  }

  if (loading) return <Spinner />;
  const items = data.items;
  const online = items.filter((a) => a.availability === 'online').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Delivery agents</h1>
          <p>{items.length} agents · {online} online now. Agents sign up themselves; deactivate an account to stop them receiving jobs.</p>
        </div>
      </div>
      <div className="card flush">
        {items.length === 0 ? <Empty title="No agents yet">Agents appear here once they register.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Status</th>
                  <th className="right">Load</th>
                  <th className="right">Delivered</th>
                  <th className="right">Failed</th>
                  <th className="right">Rating</th>
                  <th className="right">Earnings</th>
                  <th>Last location</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const [label, tone] = a.isActive ? WORK_STATE[a.workState] : ['Disabled', 'tone-critical'];
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="row">
                          <span aria-hidden style={{ fontSize: 20 }}>{VEHICLE_ICONS[a.vehicleType]}</span>
                          <div>
                            <b>{a.name}</b>
                            <div className="muted small">{a.email}{a.phone && ` · ${a.phone}`}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className={`badge ${tone}`}><span className="dot" />{label}</span></td>
                      <td className="right num">{a.activeOrders}/{a.capacity}</td>
                      <td className="right num">{a.delivered}</td>
                      <td className="right num">{a.failed}</td>
                      <td className="right num">{a.avgRating ? `${a.avgRating.toFixed(1)} ★` : '—'}</td>
                      <td className="right num">{money(a.earnings)}</td>
                      <td className="muted small">{a.location ? timeAgo(a.location.at) : 'never'}</td>
                      <td><Toggle on={a.isActive} onChange={(v) => setActive(a, v)} label={`${a.name} active`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
