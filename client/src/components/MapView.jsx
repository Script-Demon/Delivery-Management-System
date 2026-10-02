import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { VEHICLE_ICONS } from '../format.js';

// Dhaka (Gulshan / Banani / Tejgaon).
export const DEFAULT_CENTER = [23.7808, 90.4005];

const icon = (cls, html, size = 26) =>
  L.divIcon({ className: '', html: `<div class="marker ${cls}" style="width:${size}px;height:${size}px">${html}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

export const pickupIcon = icon('p', 'P');
export const dropoffIcon = icon('d', 'D');
export const agentIcon = (vehicle, { live = false, offline = false } = {}) =>
  icon(`agent ${live ? 'live' : ''} ${offline ? 'offline' : ''}`, VEHICLE_ICONS[vehicle] || '🏍️', 32);

/** Fit the map to the given points once (or whenever the set of points changes identity). */
function FitBounds({ points, fitKey }) {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter(Boolean);
    if (valid.length === 1) map.setView(valid[0], 15);
    else if (valid.length > 1) map.fitBounds(L.latLngBounds(valid), { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

function ClickHandler({ onClick }) {
  useMapEvents({ click: (e) => onClick?.(e.latlng) });
  return null;
}

export function BaseMap({ className = 'map', fitPoints = [], fitKey, onClick, children, center = DEFAULT_CENTER, zoom = 13 }) {
  const key = useMemo(() => fitKey ?? fitPoints.map((p) => p?.join(',')).join('|'), [fitKey, fitPoints]);
  return (
    <div className={className}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={fitPoints} fitKey={key} />
        {onClick && <ClickHandler onClick={onClick} />}
        {children}
      </MapContainer>
    </div>
  );
}

/** Map for a single order: pickup, drop-off, the agent's live position and their trail. */
export function OrderMap({ order, agentPos, trail = [], className }) {
  const p = [order.pickup.lat, order.pickup.lng];
  const d = [order.dropoff.lat, order.dropoff.lng];
  const a = agentPos ? [agentPos.lat, agentPos.lng] : null;
  return (
    <BaseMap className={className} fitPoints={[p, d, a]} fitKey={`${order.id}-${!!a}`}>
      <Polyline positions={[p, d]} pathOptions={{ color: '#898781', weight: 2, dashArray: '6 6' }} />
      {trail.length > 1 && <Polyline positions={trail.map((t) => [t.lat, t.lng])} pathOptions={{ color: '#2a78d6', weight: 4, opacity: 0.8 }} />}
      <Marker position={p} icon={pickupIcon}><Tooltip>Pickup · {order.pickup.label}</Tooltip></Marker>
      <Marker position={d} icon={dropoffIcon}><Tooltip>Drop-off · {order.dropoff.label}</Tooltip></Marker>
      {a && (
        <Marker position={a} icon={agentIcon(order.agent?.vehicleType, { live: true })} zIndexOffset={1000}>
          <Tooltip>{order.agent?.name ?? 'Agent'}</Tooltip>
        </Marker>
      )}
    </BaseMap>
  );
}
