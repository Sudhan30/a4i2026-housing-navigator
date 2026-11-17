import {useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {getConfig, type Record311} from './api';
import {hazardLabel} from './Blocks';
import {HAZARD_CLASS, violationClass} from './hazards';

/** Spread records that share one 100-block point so each pin is visible. */
function fan(lat: number, lng: number, n: number): [number, number] {
  if (n === 0) return [lat, lng];
  const a = (n - 1) * ((2 * Math.PI) / 3) - Math.PI / 2;
  const r = 0.00042;
  return [lat + r * Math.sin(a), lng + (r * Math.cos(a)) / 0.76];
}

export type MapView = {anchor: {lat: number; lng: number} | null; radius_m: number};

const CLASS_COLOR: Record<string, string> = Object.fromEntries(Object.entries(HAZARD_CLASS).map(([k, v]) => [k, v.color]));
const plain = (cls: string) => (HAZARD_CLASS[cls] ? `${HAZARD_CLASS[cls].label} (${HAZARD_CLASS[cls].deadline})` : cls);

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!);
}

/** Tenant's block, the corroboration radius, kept records by class, and set-aside look-alikes. */
export function RecordsMap({
  view,
  kept,
  excluded,
}: {
  view: MapView;
  kept: (Record311 & {latitude?: number; longitude?: number})[];
  excluded: (Record311 & {latitude?: number; longitude?: number})[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const [provider, setProvider] = useState<'google' | 'osm' | null>(null);
  const [layers, setLayers] = useState({records: true, setAside: true, radius: true});
  const shownKept = layers.records ? kept : [];
  const shownExcluded = layers.setAside ? excluded : [];
  const shownView = layers.radius ? view : {...view, radius_m: 0};

  useEffect(() => {
    let cancelled = false;
    getConfig().then(async c => {
      if (cancelled) return;
      if (c.mapsApiKey) {
        try {
          await loadGoogleMaps(c.mapsApiKey);
          if (!cancelled) setProvider('google');
          return;
        } catch {
          /* fall back to OSM tiles */
        }
      }
      if (!cancelled) setProvider('osm');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!el.current || !view.anchor || provider !== 'google') return;
    return drawGoogle(el.current, shownView, shownKept, shownExcluded);
  }, [provider, view, kept, excluded, layers]);

  useEffect(() => {
    if (!el.current || !view.anchor || provider !== 'osm') return;
    const {lat, lng} = view.anchor;
    const map = L.map(el.current, {zoomControl: true, scrollWheelZoom: false, attributionControl: true});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(map);

    const radius = L.circle([lat, lng], {
      radius: shownView.radius_m,
      color: '#1d4ed8',
      weight: 1.5,
      dashArray: '4 4',
      fillColor: '#1d4ed8',
      fillOpacity: 0.05,
    }).addTo(map);

    L.circleMarker([lat, lng], {radius: 16, color: '#0f1b2d', weight: 2.5, fillColor: '#0f1b2d', fillOpacity: 0.08})
      .bindTooltip("Tenant's block")
      .addTo(map);
    for (const r of shownExcluded) {
      if (r.latitude == null || r.longitude == null) continue;
      L.circleMarker([r.latitude, r.longitude], {radius: 5, color: '#94a3b8', weight: 1.5, fillColor: '#fff', fillOpacity: 1})
        .bindTooltip(`<b>${esc(r.request_id)}</b> · set aside<br>${esc(r.excluded_because ?? '')}`)
        .addTo(map);
    }
    // Several records can share one 100-block point; fan them out slightly so each is clickable.
    const seen = new Map<string, number>();
    for (const r of shownKept) {
      if (r.latitude == null || r.longitude == null) continue;
      const key = `${r.latitude},${r.longitude}`;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      const cls = violationClass(r.raw_complaint_type ?? '') ?? '';
      L.circleMarker(fan(r.latitude, r.longitude, n), {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: CLASS_COLOR[cls] ?? '#0f766e',
        fillOpacity: 0.95,
      })
        .bindTooltip(`<b>${esc(hazardLabel(r))}</b> · ${esc(plain(cls))}<br>${esc(r.request_id)} · ${esc((r.block_address ?? '').split(',')[0])}`)
        .addTo(map);
    }

    map.fitBounds(radius.getBounds(), {padding: [12, 12]});
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      map.remove();
    };
  }, [provider, view, kept, excluded, layers]);

  if (!view.anchor) return null;
  return (
    <figure className="map-figure">
      <div className="map-layers" role="group" aria-label="Map layers">
        {([['records', 'Violations on record'], ['setAside', 'Set-aside look-alikes'], ['radius', '800 m radius']] as const).map(([k, label]) => (
          <label key={k} className={`layer-chip ${layers[k] ? 'on' : ''}`}>
            <input type="checkbox" checked={layers[k]} onChange={() => setLayers(l => ({...l, [k]: !l[k]}))} />
            {label}
          </label>
        ))}
      </div>
      <div ref={el} className="records-map" role="img" aria-label="Map of the tenant's block and nearby records" />
      <figcaption className="map-legend">
        <span><i className="dot" style={{background: HAZARD_CLASS['Class C'].color}} />Immediately hazardous (24 h)</span>
        <span><i className="dot" style={{background: HAZARD_CLASS['Class B'].color}} />Hazardous (30 days)</span>
        <span><i className="dot" style={{background: HAZARD_CLASS['Class A'].color}} />Non-hazardous (90 days)</span>
        <span><i className="dot hollow" />Set aside</span>
        <span><i className="dot ring" />Tenant's block</span>
        <span className="legend-radius">
          Dashed: {view.radius_m} m search radius{provider === 'google' ? ' · Google Maps' : ''}
        </span>
      </figcaption>
    </figure>
  );
}

// ---- Google Maps --------------------------------------------------------
type Rec = Record311 & {latitude?: number; longitude?: number};
let mapsLoading: Promise<void> | null = null;
function loadGoogleMaps(key: string): Promise<void> {
  if ((window as any).google?.maps?.Map) return Promise.resolve();
  mapsLoading ??= new Promise((resolve, reject) => {
    const cb = '__hearthMapsReady';
    (window as any)[cb] = () => resolve();
    (window as any).gm_authFailure = () => reject(new Error('Maps auth failed'));
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${cb}`;
    s.async = true;
    s.onerror = () => reject(new Error('Maps failed to load'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('Maps load timeout')), 10000);
  });
  return mapsLoading;
}

const QUIET_STYLE: google.maps.MapTypeStyle[] = [
  {featureType: 'poi', stylers: [{visibility: 'off'}]},
  {featureType: 'transit.station.bus', stylers: [{visibility: 'off'}]},
  {elementType: 'labels.icon', stylers: [{visibility: 'off'}]},
  {featureType: 'road', elementType: 'geometry', stylers: [{lightness: 30}]},
];

function drawGoogle(node: HTMLElement, view: MapView, kept: Rec[], excluded: Rec[]) {
  const g = google.maps;
  const center = view.anchor!;
  const map = new g.Map(node, {
    center,
    zoom: 15,
    styles: QUIET_STYLE,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    gestureHandling: 'cooperative',
    clickableIcons: false,
  });
  const info = new g.InfoWindow();
  const dot = (color: string, scale: number, stroke = '#fff', strokeWeight = 2, fill = 0.95): google.maps.Symbol => ({
    path: g.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: fill, strokeColor: stroke, strokeWeight,
  });
  const add = (pos: google.maps.LatLngLiteral, icon: google.maps.Symbol, html: string, z = 1) => {
    const m = new g.Marker({map, position: pos, icon, zIndex: z});
    m.addListener('click', () => {
      info.setContent(`<div style="font:13px/1.4 'Public Sans',sans-serif;max-width:240px">${html}</div>`);
      info.open({map, anchor: m});
    });
    return m;
  };
  const circle = new g.Circle({
    map: view.radius_m ? map : null, center, radius: view.radius_m || 800,
    strokeColor: '#1d4ed8', strokeOpacity: 0.7, strokeWeight: 1.5,
    fillColor: '#1d4ed8', fillOpacity: 0.05, clickable: false,
  });
  add(center, dot('#0f1b2d', 16, '#0f1b2d', 2.5, 0.08), "<b>Tenant's block</b>", 0);
  for (const r of excluded) {
    if (r.latitude == null || r.longitude == null) continue;
    add({lat: r.latitude, lng: r.longitude}, dot('#ffffff', 5, '#94a3b8', 1.5, 1),
      `<b>${esc(r.request_id)}</b> · set aside<br>${esc(r.excluded_because ?? '')}`);
  }
  const seen = new Map<string, number>();
  for (const r of kept) {
    if (r.latitude == null || r.longitude == null) continue;
    const key = `${r.latitude},${r.longitude}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const cls = violationClass(r.raw_complaint_type ?? '') ?? '';
    const [la, ln] = fan(r.latitude, r.longitude, n);
    add({lat: la, lng: ln}, dot(CLASS_COLOR[cls] ?? '#0f766e', 8),
      `<b>${esc(hazardLabel(r))}</b><br>${esc(plain(cls))}<br>${esc(r.request_id)} · ${esc((r.block_address ?? '').split(',')[0])}`, 3);
  }
  const b = circle.getBounds();
  if (b) map.fitBounds(b, 8);
  return () => {
    info.close();
    node.innerHTML = '';
  };
}
