import { useState, useEffect, useRef, useCallback } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Loader2, Radar, Pencil, Trash2, Check, Save } from 'lucide-react';
import { Button } from '../ui/Button';
import { useHole } from '../../hooks/useCourses';
import { bearingBetween } from '../../utils/geo';
import type { HazardFeature } from '../../models/course';

interface HoleHazardEditorProps {
  courseId: string;
  holeNumber: number;
  onSave: () => void;
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

const HAZARD_LABELS: Record<string, string> = {
  fairway_bunker: 'FW Bunker',
  greenside_bunker: 'GS Bunker',
  water: 'Water',
  ob: 'OB',
  trees: 'Trees',
  rough: 'Rough',
};

const FAIRWAY_COLOR = '#90EE90';
const GREEN_COLOR = '#00C853';

type DrawingMode = 'hazard' | 'fairway' | 'green' | null;

let mapsInitialized = false;

export function HoleHazardEditor({ courseId, holeNumber, onSave }: HoleHazardEditorProps) {
  const { hole, isLoading } = useHole(courseId, holeNumber);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const fairwayPolygonRef = useRef<google.maps.Polygon | null>(null);
  const greenPolygonRef = useRef<google.maps.Polygon | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const drawingModeRef = useRef<DrawingMode>(null);

  const [hazards, setHazards] = useState<HazardFeature[]>([]);
  const [fairway, setFairway] = useState<{ lat: number; lng: number }[]>([]);
  const [green, setGreen] = useState<{ lat: number; lng: number }[]>([]);
  const [notes, setNotes] = useState('');
  const [yardages, setYardages] = useState<Record<string, number>>({});
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedHazardIdx, setSelectedHazardIdx] = useState<number | null>(null);

  // Sync ref with state
  useEffect(() => {
    drawingModeRef.current = drawingMode;
  }, [drawingMode]);

  // Initialize state from hole data
  useEffect(() => {
    if (hole) {
      // Filter out any legacy 'green' hazards and migrate them
      const legacyGreen = (hole.hazards ?? []).find((h) => h.type === 'green');
      const filteredHazards = (hole.hazards ?? []).filter((h) => h.type !== 'green');
      setHazards(filteredHazards);
      setFairway(hole.fairway ?? []);
      // Prefer top-level green, fall back to legacy hazard green
      setGreen(hole.green?.length ? hole.green : legacyGreen?.polygon ?? []);
      setNotes(hole.notes ?? '');
      setYardages({ ...hole.yardages });
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

      const heading = bearingBetween(hole.tee, hole.pin);

      const map = new Map(mapRef.current, {
        center,
        zoom: 17,
        mapTypeId: 'satellite',
        mapId: 'hazard-editor',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        heading,
      });

      // Re-apply heading after map tiles load (initial heading can get reset)
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
        } else if (mode === 'green') {
          setGreen(coords);
          setDrawingMode(null);
        } else if (mode === 'hazard') {
          const newHazard: HazardFeature = {
            name: 'Manual hazard',
            type: 'fairway_bunker',
            penalty: 0.3,
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

  // Render hazard/fairway/green polygons on map
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
    if (greenPolygonRef.current) {
      greenPolygonRef.current.setMap(null);
      greenPolygonRef.current = null;
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
        editable: false,
        clickable: true,
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
      fp.addListener('click', () => {
        fp.setEditable(true);
      });
      fairwayPolygonRef.current = fp;
    }

    // Green
    if (green.length >= 3) {
      const gp = new google.maps.Polygon({
        map,
        paths: green,
        fillColor: GREEN_COLOR,
        fillOpacity: 0.3,
        strokeColor: GREEN_COLOR,
        strokeWeight: 2,
        editable: false,
        clickable: true,
      });
      const syncGreen = () => {
        const path = gp.getPath();
        setGreen(
          Array.from({ length: path.getLength() }, (_, i) => ({
            lat: path.getAt(i).lat(),
            lng: path.getAt(i).lng(),
          })),
        );
      };
      gp.getPath().addListener('set_at', syncGreen);
      gp.getPath().addListener('insert_at', syncGreen);
      gp.addListener('click', () => {
        gp.setEditable(true);
      });
      greenPolygonRef.current = gp;
    }

    // Hazards
    for (let idx = 0; idx < hazards.length; idx++) {
      const h = hazards[idx];
      if (h.polygon.length < 3) continue;
      const color = HAZARD_COLORS[h.type] ?? '#FFFFFF';
      const isAccepted = h.status === 'accepted';
      const poly = new google.maps.Polygon({
        map,
        paths: h.polygon,
        fillColor: color,
        fillOpacity: isAccepted ? 0.35 : 0.2,
        strokeColor: color,
        strokeWeight: 2,
        strokeOpacity: isAccepted ? 1 : 0.5,
        editable: !isAccepted,
        clickable: true,
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

      // Click polygon to select and make editable
      poly.addListener('click', () => {
        setSelectedHazardIdx((prev) => prev === hazardIdx ? null : hazardIdx);
        if (isAccepted) {
          poly.setEditable(true);
        }
      });

      polygonsRef.current.push(poly);
    }
  }, [hazards, fairway, green]);

  // Highlight selected hazard polygon
  useEffect(() => {
    for (let i = 0; i < polygonsRef.current.length; i++) {
      const poly = polygonsRef.current[i];
      const h = hazards[i];
      if (!h) continue;
      const color = HAZARD_COLORS[h.type] ?? '#FFFFFF';
      const isSelected = i === selectedHazardIdx;
      poly.setOptions({
        strokeColor: isSelected ? '#FFFFFF' : color,
        strokeWeight: isSelected ? 4 : 2,
        fillOpacity: isSelected ? 0.55 : (h.status === 'accepted' ? 0.35 : 0.2),
      });
    }
  }, [selectedHazardIdx, hazards]);

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
      if (data.green?.length >= 3) {
        setGreen(data.green);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed');
    } finally {
      setDetecting(false);
    }
  }

  // Enter drawing mode
  function startDrawing(mode: 'hazard' | 'fairway' | 'green') {
    setDrawingMode(mode);
    if (drawingManagerRef.current) {
      drawingManagerRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
      const color = mode === 'fairway' ? FAIRWAY_COLOR : mode === 'green' ? GREEN_COLOR : '#FFD700';
      const opacity = mode === 'hazard' ? 0.3 : 0.2;
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
        body: JSON.stringify({ hazards, fairway, green, notes: notes || null, yardages }),
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
    if (selectedHazardIdx === idx) setSelectedHazardIdx(null);
    else if (selectedHazardIdx !== null && selectedHazardIdx > idx) {
      setSelectedHazardIdx(selectedHazardIdx - 1);
    }
  }

  function changeHazardType(idx: number, type: HazardFeature['type']) {
    setHazards((prev) =>
      prev.map((h, i) =>
        i === idx
          ? { ...h, type, penalty: ({ water: 1, ob: 1, fairway_bunker: 0.3, greenside_bunker: 0.5, bunker: 0.4, trees: 0.5, rough: 0.2 } as Record<string, number>)[type] ?? 0 }
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
            <Button
              onClick={() => startDrawing('green')}
              size="sm"
              variant="ghost"
            >
              <Pencil size={14} />
              Draw Green
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
              onClick={() => setSelectedHazardIdx((prev) => prev === idx ? null : idx)}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 cursor-pointer transition-colors ${
                selectedHazardIdx === idx
                  ? 'border-primary bg-primary/10 ring-1 ring-primary'
                  : 'border-border bg-surface hover:bg-surface/80'
              }`}
            >
              <div
                className="h-3 w-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: HAZARD_COLORS[h.type] ?? '#888' }}
              />
              <input
                value={h.name}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setHazards((prev) =>
                    prev.map((hz, i) => (i === idx ? { ...hz, name: e.target.value } : hz)),
                  )
                }
                className="flex-1 min-w-0 truncate text-xs text-text-dark bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-0 py-0"
                placeholder="Name this hazard"
              />
              <select
                value={h.type}
                onClick={(e) => e.stopPropagation()}
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
                  onClick={(e) => { e.stopPropagation(); acceptHazard(idx); }}
                  className="rounded p-0.5 text-emerald-600 hover:bg-emerald-500/10"
                  title="Accept"
                >
                  <Check size={14} />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); deleteHazard(idx); }}
                className="rounded p-0.5 text-coral hover:bg-coral/10"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Fairway & Green status */}
      <div className="flex gap-3 text-xs text-text-muted">
        {fairway.length >= 3 && (
          <span>Fairway: {fairway.length} pts</span>
        )}
        {green.length >= 3 && (
          <span>Green: {green.length} pts</span>
        )}
      </div>

      {/* Hole Details */}
      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <h4 className="text-xs font-semibold text-text-medium">Hole Details</h4>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-medium">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tips, e.g. 'favor left side'"
            rows={2}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-dark placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-medium">Yardages</label>
          <div className="grid grid-cols-3 gap-2">
            {['blue', 'white', 'red'].map((tee) => (
              <div key={tee} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-medium text-text-muted capitalize">{tee}</span>
                <input
                  type="number"
                  value={yardages[tee] ?? ''}
                  onChange={(e) =>
                    setYardages((prev) => ({
                      ...prev,
                      [tee]: e.target.value ? parseInt(e.target.value) : 0,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-text-dark focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="yds"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

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
            Save All
          </>
        )}
      </Button>
    </div>
  );
}
