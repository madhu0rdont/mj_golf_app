import { useState, useEffect, useRef, useCallback } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Loader2 } from 'lucide-react';
import { haversineYards, bearingBetween, bezierPath } from '../../utils/geo';
import type { CourseHole } from '../../models/course';
import type { LandingZone } from '../../hooks/useHoleStrategy';

interface AimPointInfo {
  position: { lat: number; lng: number };
  rawAimPoint?: { lat: number; lng: number };
  clubName: string;
  shotNumber: number;
  carry?: number;
  carryNote?: string | null;
  tip?: string;
}

interface HoleViewerProps {
  hole: CourseHole;
  teeBox?: string;
  landingZones?: LandingZone[];
  aimPoints?: AimPointInfo[];
}

const HAZARD_COLORS: Record<string, string> = {
  bunker: '#FFD700',
  fairway_bunker: '#DAA520',
  greenside_bunker: '#FFA500',
  water: '#4169E1',
  ob: '#FF4444',
  trees: '#228B22',
  rough: '#8B7355',
};

const FAIRWAY_COLOR = '#90EE90';
const GREEN_COLOR = '#00C853';

let mapsInitialized = false;

/** Ensure lat/lng are numeric (DB may return strings from JSONB) */
function numPos(pos: { lat: unknown; lng: unknown }): { lat: number; lng: number } {
  return { lat: Number(pos.lat), lng: Number(pos.lng) };
}

export function HoleViewer({ hole, landingZones, aimPoints }: HoleViewerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<(google.maps.Polygon | google.maps.Polyline | google.maps.marker.AdvancedMarkerElement)[]>([]);
  const simOverlaysRef = useRef<(google.maps.Polygon | google.maps.Polyline | google.maps.marker.AdvancedMarkerElement)[]>([]);
  const measureRef = useRef<{
    marker: google.maps.marker.AdvancedMarkerElement | null;
    listener: google.maps.MapsEventListener | null;
  }>({ marker: null, listener: null });

  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setMeasureInfo] = useState<{ fromTee: number; toPin: number } | null>(null);

  // Track the current hole number so we can detect hole switches
  const currentHoleRef = useRef<string>(hole.id);

  // Initialize Google Maps (once)
  useEffect(() => {
    if (!mapRef.current) return;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setError('VITE_GOOGLE_MAPS_API_KEY not configured');
      return;
    }

    let cancelled = false;

    async function init() {
      if (!mapsInitialized) {
        setOptions({ key: apiKey });
        mapsInitialized = true;
      }

      const { Map } = await importLibrary('maps') as google.maps.MapsLibrary;
      await importLibrary('marker');

      if (cancelled || !mapRef.current) return;

      const tee = numPos(hole.tee);
      const pin = numPos(hole.pin);
      const center = {
        lat: (tee.lat + pin.lat) / 2,
        lng: (tee.lng + pin.lng) / 2,
      };

      const map = new Map(mapRef.current, {
        center,
        zoom: 17,
        mapTypeId: 'satellite',
        mapId: 'strategy-viewer',
        heading: bearingBetween(tee, pin),
        tilt: 0,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });

      mapInstanceRef.current = map;
      setMapReady(true);
      fetch('/api/track/map-impression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'maps_js', endpoint: 'hole_viewer' }),
      }).catch(() => {});
    }

    init();
    return () => { cancelled = true; };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear all overlays helper
  const clearOverlays = useCallback(() => {
    for (const o of overlaysRef.current) {
      if ('setMap' in o && typeof o.setMap === 'function') {
        o.setMap(null);
      } else if ('map' in o) {
        (o as google.maps.marker.AdvancedMarkerElement).map = null;
      }
    }
    overlaysRef.current = [];
  }, []);

  // Clear measure marker
  const clearMeasure = useCallback(() => {
    if (measureRef.current.marker) {
      measureRef.current.marker.map = null;
      measureRef.current.marker = null;
    }
    setMeasureInfo(null);
  }, []);

  // Clear sim overlays (independent of hole overlays)
  const clearSimOverlays = useCallback(() => {
    for (const o of simOverlaysRef.current) {
      if ('setMap' in o && typeof o.setMap === 'function') {
        o.setMap(null);
      } else if ('map' in o) {
        (o as google.maps.marker.AdvancedMarkerElement).map = null;
      }
    }
    simOverlaysRef.current = [];
  }, []);

  // Render sim ellipse overlays
  const renderSimOverlays = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    clearSimOverlays();
    if (!landingZones || landingZones.length === 0) return;

    for (let i = 0; i < landingZones.length; i++) {
      const zone = landingZones[i];

      // Outer ellipse (3σ, lighter)
      const sigma2Poly = new google.maps.Polygon({
        map,
        paths: zone.sigma2,
        fillColor: '#00BCD4',
        fillOpacity: 0.2,
        strokeColor: '#00BCD4',
        strokeWeight: 1.5,
        strokeOpacity: 0.7,
        editable: false,
        clickable: false,
      });
      simOverlaysRef.current.push(sigma2Poly);

      // Inner ellipse (1.5σ, brighter)
      const sigma1Poly = new google.maps.Polygon({
        map,
        paths: zone.sigma1,
        fillColor: '#00E5FF',
        fillOpacity: 0.4,
        strokeColor: '#00E5FF',
        strokeWeight: 2,
        editable: false,
        clickable: false,
      });
      simOverlaysRef.current.push(sigma1Poly);

    }

    // Aim directions — use rawAimPoint (where to point the club) when available,
    // fall back to position (expected landing) if server hasn't sent raw aim data
    const aimPositions = aimPoints && aimPoints.length > 0
      ? aimPoints.map((a) => a.rawAimPoint ?? a.position)
      : landingZones.map((z) => z.center);

    // Landing positions (where ball actually lands — for numbered markers)
    const markerPositions = landingZones && landingZones.length > 0
      ? landingZones.map((z) => z.center)
      : aimPositions;

    for (let j = 0; j < markerPositions.length; j++) {
      const wrapEl = document.createElement('div');
      wrapEl.style.cssText = 'display:flex;flex-direction:column;align-items:center;pointer-events:none;';

      const circleEl = document.createElement('div');
      circleEl.style.cssText =
        'width:24px;height:24px;border-radius:50%;background:#00E5FF;' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-size:12px;font-weight:700;color:#000;' +
        'border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);';
      circleEl.textContent = String(j + 1);
      wrapEl.appendChild(circleEl);

      const circleMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: markerPositions[j],
        content: wrapEl,
      });
      simOverlaysRef.current.push(circleMarker);
    }

    // Per-shot dual lines: aim line (dashed white) + ball flight (solid cyan, curved)
    for (let i = 0; i < aimPositions.length; i++) {
      const from = i === 0
        ? numPos(hole.tee)
        : landingZones![i - 1]?.center ?? numPos(hole.tee);
      const aimTo = aimPositions[i];
      const landTo = landingZones![i]?.center ?? aimTo;

      // 1. Aim line (white dashed) — where to point the club
      const aimLine = new google.maps.Polyline({
        map,
        path: [from, aimTo],
        strokeOpacity: 0,
        icons: [{
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 0.5,
            strokeColor: '#FFFFFF',
            strokeWeight: 1.5,
            scale: 2,
          },
          repeat: '10px',
        }],
        clickable: false,
      });
      simOverlaysRef.current.push(aimLine);

      // 2. Ball flight (cyan solid with arrows, curved if lateral bias exists)
      const biasYards = haversineYards(aimTo, landTo);
      const flightPath = biasYards > 2
        ? bezierPath(from, aimTo, landTo, 20)
        : [from, landTo];

      const flightLine = new google.maps.Polyline({
        map,
        path: flightPath,
        strokeColor: '#00E5FF',
        strokeWeight: 2.5,
        strokeOpacity: 0.9,
        icons: [{
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 3,
            strokeColor: '#00E5FF',
            strokeWeight: 2,
            fillColor: '#00E5FF',
            fillOpacity: 1,
          },
          repeat: '80px',
          offset: '50%',
        }],
        clickable: false,
      });
      simOverlaysRef.current.push(flightLine);
    }
  }, [landingZones, aimPoints, clearSimOverlays, hole.tee.lat, hole.tee.lng, hole.pin.lat, hole.pin.lng]);

  // Render all overlays when hole changes
  const renderOverlays = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    try {
    clearOverlays();
    clearSimOverlays();
    clearMeasure();

    // Fit bounds, then orient tee-to-pin upward
    const tee = numPos(hole.tee);
    const pin = numPos(hole.pin);
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(tee);
    bounds.extend(pin);
    if (landingZones) {
      for (const z of landingZones) bounds.extend(z.center);
    }
    for (const poly of hole.fairway) {
      for (const p of poly) bounds.extend(p);
    }
    map.fitBounds(bounds, { top: 40, bottom: 40, left: 20, right: 20 });

    // Apply heading after fitBounds settles — fitBounds resets heading to 0.
    // Use moveCamera to atomically set heading with the computed center/zoom.
    const heading = bearingBetween(tee, pin);
    google.maps.event.addListenerOnce(map, 'idle', () => {
      try {
        map.moveCamera({
          center: map.getCenter()!,
          zoom: map.getZoom()!,
          heading,
          tilt: 0,
        });
      } catch {
        map.setHeading(heading);
      }
    });

    // 1. Fairway polygons (may be multiple for split fairways)
    for (const fairwayPoly of hole.fairway) {
      if (fairwayPoly.length < 3) continue;
      const fp = new google.maps.Polygon({
        map,
        paths: fairwayPoly,
        fillColor: FAIRWAY_COLOR,
        fillOpacity: 0.2,
        strokeColor: FAIRWAY_COLOR,
        strokeWeight: 1,
        editable: false,
        clickable: false,
      });
      overlaysRef.current.push(fp);
    }

    // 1b. Green polygon
    if (hole.green?.length >= 3) {
      const gp = new google.maps.Polygon({
        map,
        paths: hole.green,
        fillColor: GREEN_COLOR,
        fillOpacity: 0.3,
        strokeColor: GREEN_COLOR,
        strokeWeight: 1,
        editable: false,
        clickable: false,
      });
      overlaysRef.current.push(gp);
    }

    // 2. Hazard polygons
    for (const h of hole.hazards) {
      if (h.polygon.length < 3) continue;
      const color = HAZARD_COLORS[h.type] ?? '#FFFFFF';
      const isOB = h.type === 'ob';

      const poly = new google.maps.Polygon({
        map,
        paths: h.polygon,
        fillColor: color,
        fillOpacity: isOB ? 0.1 : 0.3,
        strokeColor: color,
        strokeWeight: isOB ? 0 : 2,
        editable: false,
        clickable: false,
      });
      overlaysRef.current.push(poly);

      // OB dashed boundary
      if (isOB) {
        const dashLine = new google.maps.Polyline({
          map,
          path: [...h.polygon, h.polygon[0]],
          strokeOpacity: 0,
          icons: [{
            icon: {
              path: 'M 0,-1 0,1',
              strokeOpacity: 0.8,
              strokeColor: color,
              strokeWeight: 2,
              scale: 3,
            },
            repeat: '15px',
          }],
          clickable: false,
        });
        overlaysRef.current.push(dashLine);
      }
    }

    // 3. Center line (white dashed)
    if (hole.centerLine?.length > 1) {
      const cl = new google.maps.Polyline({
        map,
        path: hole.centerLine.map((c) => ({ lat: c.lat, lng: c.lng })),
        strokeOpacity: 0,
        icons: [{
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 0.7,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
            scale: 3,
          },
          repeat: '12px',
        }],
        clickable: false,
      });
      overlaysRef.current.push(cl);
    }

    // 4. Tee marker (blue)
    try {
      const teeEl = document.createElement('div');
      teeEl.style.cssText = 'width:24px;height:24px;border-radius:50%;background:#3B82F6;border:2px solid white;display:flex;align-items:center;justify-content:center;font:bold 11px sans-serif;color:white;box-shadow:0 2px 6px rgba(0,0,0,0.4);';
      teeEl.textContent = 'T';
      const teePos = new google.maps.LatLng(tee.lat, tee.lng);
      const teeMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: teePos,
        content: teeEl,
        title: 'Tee',
      });
      overlaysRef.current.push(teeMarker);
    } catch (e) {
      console.error('Tee marker failed:', tee, e);
    }

    // 6. Pin marker (red)
    try {
      const pinEl = document.createElement('div');
      pinEl.style.cssText = 'width:24px;height:24px;border-radius:50%;background:#EF4444;border:2px solid white;display:flex;align-items:center;justify-content:center;font:bold 11px sans-serif;color:white;box-shadow:0 2px 6px rgba(0,0,0,0.4);';
      pinEl.textContent = 'P';
      const pinPos = new google.maps.LatLng(pin.lat, pin.lng);
      const pinMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: pinPos,
        content: pinEl,
        title: 'Pin',
      });
      overlaysRef.current.push(pinMarker);
    } catch (e) {
      console.error('Pin marker failed:', pin, e);
    }

    currentHoleRef.current = hole.id;
    } catch (e) {
      console.error('renderOverlays failed:', e);
    }
  }, [hole, landingZones, clearOverlays, clearSimOverlays, clearMeasure]);

  // Set up tap-to-measure click listener
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    // Remove old listener
    if (measureRef.current.listener) {
      measureRef.current.listener.remove();
    }

    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const point = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      const fromTee = haversineYards(numPos(hole.tee), point);
      const toPin = haversineYards(point, numPos(hole.pin));

      // Clear previous measure marker
      if (measureRef.current.marker) {
        measureRef.current.marker.map = null;
      }

      // Crosshair + pill
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;';

      const crosshair = document.createElement('div');
      crosshair.style.cssText =
        'width:16px;height:16px;border:2px solid white;border-radius:50%;' +
        'position:relative;box-shadow:0 0 4px rgba(0,0,0,0.5);';
      const hLine = document.createElement('div');
      hLine.style.cssText = 'position:absolute;top:50%;left:1px;right:1px;height:1px;background:white;transform:translateY(-50%);';
      const vLine = document.createElement('div');
      vLine.style.cssText = 'position:absolute;left:50%;top:1px;bottom:1px;width:1px;background:white;transform:translateX(-50%);';
      crosshair.appendChild(hLine);
      crosshair.appendChild(vLine);
      el.appendChild(crosshair);

      const pill = document.createElement('div');
      pill.style.cssText =
        'margin-top:4px;background:rgba(0,0,0,0.8);border-radius:12px;padding:3px 8px;' +
        'font-size:11px;color:white;white-space:nowrap;font-weight:500;';
      pill.textContent = `${fromTee} from tee · ${toPin} to pin`;
      el.appendChild(pill);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: point,
        content: el,
      });

      measureRef.current.marker = marker;
      setMeasureInfo({ fromTee, toPin });
    });

    measureRef.current.listener = listener;

    return () => {
      listener.remove();
    };
  }, [mapReady, hole.tee.lat, hole.tee.lng, hole.pin.lat, hole.pin.lng, hole.id]);

  // Render overlays when map is ready or hole changes
  useEffect(() => {
    if (mapReady) renderOverlays();
  }, [mapReady, renderOverlays]);

  // Render sim overlays when landing zones change (independent of hole overlays)
  useEffect(() => {
    if (mapReady) renderSimOverlays();
  }, [mapReady, renderSimOverlays]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-[50vh] min-h-[280px] sm:h-[55vh] rounded-sm border border-border bg-surface">
        <p className="text-sm text-coral">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={mapRef}
        className="h-[50vh] min-h-[280px] sm:h-[55vh] w-full rounded-sm overflow-hidden border border-border"
      />
      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center rounded-sm bg-surface">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
