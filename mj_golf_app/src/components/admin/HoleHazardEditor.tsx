import { useState, useEffect, useRef, useCallback } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Loader2, Radar, Pencil, Trash2, Check, Save } from 'lucide-react';
import { Button } from '../ui/Button';
import { useHole } from '../../hooks/useCourses';
import type { HazardFeature } from '../../models/course';

interface HoleHazardEditorProps {
  courseId: string;
  holeNumber: number;
  onSave: () => void;
}

const HAZARD_COLORS: Record<string, string> = {
  bunker: '#FFD700',
  water: '#4169E1',
  ob: '#FF4444',
  trees: '#228B22',
  rough: '#8B7355',
  green: '#00C853',
};

const HAZARD_LABELS: Record<string, string> = {
  bunker: 'Bunker',
  water: 'Water',
  ob: 'OB',
  trees: 'Trees',
  rough: 'Rough',
  green: 'Green',
};

const FAIRWAY_COLOR = '#90EE90';

let mapsInitialized = false;

export function HoleHazardEditor({ courseId, holeNumber, onSave }: HoleHazardEditorProps) {
  const { hole, isLoading } = useHole(courseId, holeNumber);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const fairwayPolygonRef = useRef<google.maps.Polygon | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const drawingModeRef = useRef<'hazard' | 'fairway' | null>(null);

  const [hazards, setHazards] = useState<HazardFeature[]>([]);
  const [fairway, setFairway] = useState<{ lat: number; lng: number }[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [drawingMode, setDrawingMode] = useState<'hazard' | 'fairway' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync ref with state
  useEffect(() => {
    drawingModeRef.current = drawingMode;
  }, [drawingMode]);

  // Initialize state from hole data
  useEffect(() => {
    if (hole) {
      setHazards(hole.hazards ?? []);
      setFairway(hole.fairway ?? []);
    }
  }, [hole]);

  // Initialize Google Maps
  useEffect(() => {
    if (!hole || !mapRef.current) return;

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
      const { DrawingManager } = await importLibrary('drawing') as google.maps.DrawingLibrary;
      await importLibrary('marker');

      if (cancelled || !mapRef.current || !hole) return;

      const center = {
        lat: (hole.tee.lat + hole.pin.lat) / 2,
        lng: (hole.tee.lng + hole.pin.lng) / 2,
      };

      const map = new Map(mapRef.current, {
        center,
        zoom: 17,
        mapTypeId: 'satellite',
        mapId: 'hazard-editor',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });

      mapInstanceRef.current = map;

      // Drawing manager (hidden by default)
      const dm = new DrawingManager({
        drawingMode: null,
        drawingControl: false,
        polygonOptions: {
          fillColor: '#FFFFFF',
          fillOpacity: 0.3,
          strokeWeight: 2,
          editable: true,
        },
      });
      dm.setMap(map);
      drawingManagerRef.current = dm;

      // Listen for polygon complete
      dm.addListener('polygoncomplete', (polygon: google.maps.Polygon) => {
        const path = polygon.getPath();
        const coords = Array.from({ length: path.getLength() }, (_, i) => ({
          lat: path.getAt(i).lat(),
          lng: path.getAt(i).lng(),
        }));

        // Remove the drawing manager polygon (we manage our own)
        polygon.setMap(null);
        dm.setDrawingMode(null);

        const mode = drawingModeRef.current;

        if (mode === 'fairway') {
          setFairway(coords);
          setDrawingMode(null);
        } else if (mode === 'hazard') {
          const newHazard: HazardFeature = {
            name: 'Manual hazard',
            type: 'bunker',
            penalty: 0,
            confidence: 'high',
            source: 'manual',
            status: 'accepted',
            polygon: coords,
          };
          setHazards((prev) => [...prev, newHazard]);
          setDrawingMode(null);
        }
      });

      setMapReady(true);
    }

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole?.tee.lat, hole?.tee.lng, hole?.pin.lat, hole?.pin.lng]);

  // Render markers for tee/pin
  const renderMarkers = useCallback(() => {
    if (!mapInstanceRef.current || !hole) return;

    // Clear old markers
    for (const m of markersRef.current) m.map = null;
    markersRef.current = [];
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    const map = mapInstanceRef.current;

    // Tee marker
    const teeEl = document.createElement('div');
    teeEl.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#3B82F6;border:2px solid white;';
    const teeMarker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: { lat: hole.tee.lat, lng: hole.tee.lng },
      content: teeEl,
      title: 'Tee',
    });
    markersRef.current.push(teeMarker);

    // Pin marker
    const pinEl = document.createElement('div');
    pinEl.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#EF4444;border:2px solid white;';
    const pinMarker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: { lat: hole.pin.lat, lng: hole.pin.lng },
      content: pinEl,
      title: 'Pin',
    });
    markersRef.current.push(pinMarker);

    // Center line
    if (hole.centerLine?.length > 1) {
      polylineRef.current = new google.maps.Polyline({
        map,
        path: hole.centerLine.map((c) => ({ lat: c.lat, lng: c.lng })),
        strokeColor: '#FFFFFF',
        strokeOpacity: 0.6,
        strokeWeight: 2,
        geodesic: true,
      });
    }
  }, [hole]);

  // Render hazard/fairway polygons on map
  const renderPolygons = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clear old polygons
    for (const p of polygonsRef.current) p.setMap(null);
    polygonsRef.current = [];
    if (fairwayPolygonRef.current) {
      fairwayPolygonRef.current.setMap(null);
      fairwayPolygonRef.current = null;
    }

    // Fairway
    if (fairway.length >= 3) {
      const fp = new google.maps.Polygon({
        map,
        paths: fairway,
        fillColor: FAIRWAY_COLOR,
        fillOpacity: 0.2,
        strokeColor: FAIRWAY_COLOR,
        strokeWeight: 2,
        editable: true,
      });
      const syncFairway = () => {
        const path = fp.getPath();
        setFairway(
          Array.from({ length: path.getLength() }, (_, i) => ({
            lat: path.getAt(i).lat(),
            lng: path.getAt(i).lng(),
          })),
        );
      };
      fp.getPath().addListener('set_at', syncFairway);
      fp.getPath().addListener('insert_at', syncFairway);
      fairwayPolygonRef.current = fp;
    }

    // Hazards
    for (let idx = 0; idx < hazards.length; idx++) {
      const h = hazards[idx];
      if (h.polygon.length < 3) continue;
      const color = HAZARD_COLORS[h.type] ?? '#FFFFFF';
      const poly = new google.maps.Polygon({
        map,
        paths: h.polygon,
        fillColor: color,
        fillOpacity: h.status === 'pending' ? 0.2 : 0.35,
        strokeColor: color,
        strokeWeight: 2,
        strokeOpacity: h.status === 'pending' ? 0.5 : 1,
        editable: true,
      });

      const hazardIdx = idx;
      const updatePath = () => {
        const path = poly.getPath();
        const coords = Array.from({ length: path.getLength() }, (_, i) => ({
          lat: path.getAt(i).lat(),
          lng: path.getAt(i).lng(),
        }));
        setHazards((prev) =>
          prev.map((hz, i) => (i === hazardIdx ? { ...hz, polygon: coords } : hz)),
        );
      };
      poly.getPath().addListener('set_at', updatePath);
      poly.getPath().addListener('insert_at', updatePath);

      polygonsRef.current.push(poly);
    }
  }, [hazards, fairway]);

  useEffect(() => {
    if (mapReady) renderMarkers();
  }, [mapReady, renderMarkers]);

  useEffect(() => {
    if (mapReady) renderPolygons();
  }, [mapReady, renderPolygons]);

  // Auto-detect hazards
  async function handleDetect() {
    setDetecting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/hazard-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ courseId, holeNumber }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Detection failed' }));
        throw new Error(body.error || `Detection failed (${res.status})`);
      }
      const data = await res.json();
      setHazards(data.hazards ?? []);
      if (data.fairway?.length >= 3) {
        setFairway(data.fairway);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed');
    } finally {
      setDetecting(false);
    }
  }

  // Enter drawing mode
  function startDrawing(mode: 'hazard' | 'fairway') {
    setDrawingMode(mode);
    if (drawingManagerRef.current) {
      drawingManagerRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
      const color = mode === 'fairway' ? FAIRWAY_COLOR : '#FFD700';
      const opacity = mode === 'fairway' ? 0.2 : 0.3;
      drawingManagerRef.current.setOptions({
        polygonOptions: {
          fillColor: color,
          fillOpacity: opacity,
          strokeColor: color,
          strokeWeight: 2,
          editable: true,
        },
      });
    }
  }

  function cancelDrawing() {
    setDrawingMode(null);
    if (drawingManagerRef.current) {
      drawingManagerRef.current.setDrawingMode(null);
    }
  }

  // Save
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/${courseId}/holes/${holeNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ hazards, fairway }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // Hazard list actions
  function acceptHazard(idx: number) {
    setHazards((prev) =>
      prev.map((h, i) => (i === idx ? { ...h, status: 'accepted' } : h)),
    );
  }

  function deleteHazard(idx: number) {
    setHazards((prev) => prev.filter((_, i) => i !== idx));
  }

  function changeHazardType(idx: number, type: HazardFeature['type']) {
    setHazards((prev) =>
      prev.map((h, i) =>
        i === idx
          ? { ...h, type, penalty: type === 'water' || type === 'ob' ? 1 : 0 }
          : h,
      ),
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3">
      <h3 className="text-sm font-semibold text-text-dark">
        Hole {holeNumber} — Par {hole?.par}
      </h3>

      {error && (
        <div className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
          {error}
        </div>
      )}

      {/* Map */}
      <div
        ref={mapRef}
        className="h-[400px] w-full rounded-xl overflow-hidden border border-border"
      />

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleDetect}
          disabled={detecting}
          size="sm"
          variant="secondary"
        >
          {detecting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Detecting...
            </>
          ) : (
            <>
              <Radar size={14} />
              Auto-detect
            </>
          )}
        </Button>

        {drawingMode ? (
          <Button onClick={cancelDrawing} size="sm" variant="ghost">
            Cancel Drawing
          </Button>
        ) : (
          <>
            <Button
              onClick={() => startDrawing('hazard')}
              size="sm"
              variant="ghost"
            >
              <Pencil size={14} />
              Draw Hazard
            </Button>
            <Button
              onClick={() => startDrawing('fairway')}
              size="sm"
              variant="ghost"
            >
              <Pencil size={14} />
              Draw Fairway
            </Button>
          </>
        )}
      </div>

      {drawingMode && (
        <p className="text-xs text-amber-600">
          Click on the map to draw a {drawingMode} polygon. Click the first point
          to close.
        </p>
      )}

      {/* Hazard list */}
      {hazards.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-semibold text-text-medium">
            Hazards ({hazards.length})
          </h4>
          {hazards.map((h, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5"
            >
              <div
                className="h-3 w-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: HAZARD_COLORS[h.type] ?? '#888' }}
              />
              <span className="flex-1 truncate text-xs text-text-dark">
                {h.name}
              </span>
              <select
                value={h.type}
                onChange={(e) =>
                  changeHazardType(idx, e.target.value as HazardFeature['type'])
                }
                className="rounded border border-border bg-card px-1 py-0.5 text-[10px] text-text-dark"
              >
                {Object.entries(HAZARD_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                  h.status === 'accepted'
                    ? 'bg-emerald-500/20 text-emerald-600'
                    : 'bg-amber-500/20 text-amber-600'
                }`}
              >
                {h.status === 'accepted' ? 'Accepted' : 'Pending'}
              </span>
              {h.status !== 'accepted' && (
                <button
                  onClick={() => acceptHazard(idx)}
                  className="rounded p-0.5 text-emerald-600 hover:bg-emerald-500/10"
                  title="Accept"
                >
                  <Check size={14} />
                </button>
              )}
              <button
                onClick={() => deleteHazard(idx)}
                className="rounded p-0.5 text-coral hover:bg-coral/10"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Fairway status */}
      {fairway.length >= 3 && (
        <p className="text-xs text-text-muted">
          Fairway polygon: {fairway.length} points
        </p>
      )}

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save size={16} />
            Save Hazards & Fairway
          </>
        )}
      </Button>
    </div>
  );
}
