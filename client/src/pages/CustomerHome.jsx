import { Link } from 'react-router-dom';
import { useApi } from '../api.js';
import { useSession, useSocketEvent } from '../session.jsx';
import { Empty, Spinner, Stat, StatusBadge } from '../components/ui.jsx';
import OrderCard from '../components/OrderCard.jsx';
import { money, dateTime } from '../format.js';

export default function CustomerHome() {
  const { user } = useSession();
  const open = useApi('/orders?scope=open&pageSize=50');
  const recent = useApi('/orders?scope=closed&pageSize=5');
  const addresses = useApi('/addresses');
  useSocketEvent('order:changed', () => { open.reload(); recent.reload(); });

  if (open.loading || recent.loading || addresses.loading) return <Spinner />;
  const noAddresses = addresses.data?.items.length < 2;
  const delivered = recent.data.items.filter((o) => o.status === 'delivered');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Hi {user.name.split(' ')[0]} 👋</h1>
          <p>Track your active deliveries and send something new.</p>
        </div>
        <Link className="btn primary" to="/orders/new">➕ New delivery</Link>
      </div>

      {noAddresses && (
        <div className="alert info">
          Save at least two addresses (a pickup and a drop-off) before placing an order. <Link to="/addresses">Add addresses →</Link>
        </div>
      )}

      <div className="grid grid-3">
        <Stat label="Active deliveries" value={open.data.total} />
        <Stat label="Completed (recent)" value={delivered.length} sub="last 5 closed orders" />
        <Stat label="Saved addresses" value={addresses.data.items.length} />
      </div>

      <section className="stack">
        <h2>In progress</h2>
        {open.data.items.length === 0 ? (
          <div className="card"><Empty icon="🛵" title="No active deliveries">Your in-progress orders will show up here with live status.</Empty></div>
        ) : (
          <div className="grid grid-2">
            {open.data.items.map((o) => (
              <OrderCard key={o.id} order={o}>
                <div className="spread">
                  <span className="secondary small">{o.agent ? `${o.agent.name} is handling this` : 'Waiting for an agent'}</span>
                  <Link className="btn sm" to={`/orders/${o.id}`}>{o.agent?.location ? 'Track live' : 'Details'}</Link>
                </div>
              </OrderCard>
            ))}
          </div>
        )}
      </section>

      <section className="card flush">
        <div className="card-head" style={{ padding: '16px 20px 0' }}>
          <h2>Recent history</h2>
          <Link to="/orders" className="small">View all</Link>
        </div>
        {recent.data.items.length === 0 ? (
          <Empty title="No past orders yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {recent.data.items.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/orders/${o.id}`}>{o.code}</Link></td>
                    <td>{o.description}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="muted">{dateTime(o.closedAt)}</td>
                    <td className="right num">{money(o.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
