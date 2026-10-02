import { Link } from 'react-router-dom';
import { StatusBadge, PackageTag, Route, Stepper } from './ui.jsx';
import { money, timeAgo } from '../format.js';

export default function OrderCard({ order, children, showEarning }) {
  return (
    <div className="card order-card">
      <div className="spread">
        <div className="row wrap">
          <Link to={`/orders/${order.id}`}><b>{order.code}</b></Link>
          <StatusBadge status={order.status} />
        </div>
        <span className="muted small">{timeAgo(order.createdAt)}</span>
      </div>
      <div className="spread">
        <PackageTag order={order} />
        <b className="num">{money(showEarning ? order.agentEarning : order.fee)}</b>
      </div>
      <div className="secondary">{order.description}</div>
      <Route pickup={order.pickup} dropoff={order.dropoff} />
      <Stepper status={order.status} />
      {children}
    </div>
  );
}
