'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ImageOverlay,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';

import { CRS } from 'leaflet';
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import Comments from './Comments';

const icon = L.icon({
  iconUrl: '/icon.png',
  iconSize: [96, 96],
  iconAnchor: [48, 72],
  popupAnchor: [0, -96],
});

type ZonePoint = [number, number];
type CreationMode = 'none' | 'marker' | 'zone';
type SearchResultType = 'marker' | 'zone';

type ZoneType = {
  id: number;
  title: string;
  description: string | null;
  color: string;
  coordinates: ZonePoint[];
};

type MarkerType = {
  id: number;
  x: number;
  y: number;
  title: string;
  description: string | null;
};

type SearchResult = {
  key: string;
  id: number;
  type: SearchResultType;
  title: string;
};

function MapInteractionHandler({
  creationMode,
  onAddMarker,
  onAddZonePoint,
}: {
  creationMode: CreationMode;
  onAddMarker: (x: number, y: number) => Promise<void>;
  onAddZonePoint: (point: ZonePoint) => void;
}) {
  useMapEvents({
    async click(e) {
      if (creationMode === 'marker') {
        await onAddMarker(e.latlng.lng, e.latlng.lat);
        return;
      }

      if (creationMode === 'zone') {
        onAddZonePoint([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  return null;
}

function MapController({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}

export default function MapView({
  isAdmin,
  onAdminClick,
}: {
  isAdmin: boolean;
  onAdminClick: () => void;
}) {
  const [markers, setMarkers] = useState<MarkerType[]>([]);
  const [zones, setZones] = useState<ZoneType[]>([]);
  const [creationMode, setCreationMode] = useState<CreationMode>('none');
  const [draftZone, setDraftZone] = useState<ZonePoint[]>([]);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const mapRef = useRef<L.Map | null>(null);
  const markerRefs = useRef<Record<number, L.Marker>>({});
  const zoneRefs = useRef<Record<number, L.Polygon>>({});

  const IMAGE_WIDTH = 3840;
  const IMAGE_HEIGHT = 2160;
  const POPUP_Y_THRESHOLD = IMAGE_HEIGHT * 0.75;

  const bounds: [[number, number], [number, number]] = [
    [0, 0],
    [IMAGE_HEIGHT, IMAGE_WIDTH],
  ];

  const allSearchResults: SearchResult[] = [
    ...markers.map((marker) => ({
      key: `marker-${marker.id}`,
      id: marker.id,
      type: 'marker' as const,
      title: marker.title,
    })),
    ...zones.map((zone) => ({
      key: `zone-${zone.id}`,
      id: zone.id,
      type: 'zone' as const,
      title: zone.title,
    })),
  ];

  const normalizedSearch = search.trim().toLowerCase();
  const suggestions = normalizedSearch
    ? allSearchResults
        .filter((result) => result.title.toLowerCase().includes(normalizedSearch))
        .sort((a, b) => {
          const aStarts = a.title.toLowerCase().startsWith(normalizedSearch) ? 0 : 1;
          const bStarts = b.title.toLowerCase().startsWith(normalizedSearch) ? 0 : 1;
          return aStarts - bStarts || a.title.localeCompare(b.title, 'ru');
        })
        .slice(0, 5)
    : [];

  function cancelCreation() {
    setCreationMode('none');
    setDraftZone([]);
    setIsAddMenuOpen(false);
  }

  function startAddingMarker() {
    if (!isAdmin) return;
    setDraftZone([]);
    setCreationMode('marker');
    setIsAddMenuOpen(false);
  }

  function startDrawingZone() {
    if (!isAdmin) return;
    setDraftZone([]);
    setCreationMode('zone');
    setIsAddMenuOpen(false);
  }

  function openSearchResult(result?: SearchResult) {
    const chosen =
      result ||
      allSearchResults.find(
        (item) => item.title.toLowerCase() === normalizedSearch
      ) ||
      suggestions[0];

    if (!chosen || !mapRef.current) return;

    setSearch(chosen.title);
    setIsSearchOpen(false);

    if (chosen.type === 'marker') {
      const marker = markers.find((item) => item.id === chosen.id);
      if (!marker) return;

      mapRef.current.setView([marker.y, marker.x], 0);
      window.setTimeout(() => markerRefs.current[marker.id]?.openPopup(), 150);
      return;
    }

    const zone = zones.find((item) => item.id === chosen.id);
    if (!zone || zone.coordinates.length < 3) return;

    const zoneBounds = L.latLngBounds(zone.coordinates);
    mapRef.current.fitBounds(zoneBounds, {
      padding: [100, 100],
      maxZoom: 1,
    });
    window.setTimeout(() => zoneRefs.current[zone.id]?.openPopup(), 200);
  }

  async function loadZones() {
    const { data, error } = await supabase
      .from('zones')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setZones((data || []) as ZoneType[]);
  }

  async function finishDrawingZone() {
    if (draftZone.length < 3) {
      alert('Для зоны нужно поставить минимум 3 точки');
      return;
    }

    const title = prompt('Название зоны');
    if (!title) return;

    const description = prompt('Описание зоны') || '';
    const color = prompt('Цвет зоны в HEX', '#b45309') || '#b45309';

    const { data, error } = await supabase
      .from('zones')
      .insert({
        title,
        description,
        color,
        coordinates: draftZone,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      alert('Ошибка сохранения зоны');
      return;
    }

    setZones((current) => [...current, data as ZoneType]);
    cancelCreation();
  }

  async function deleteZone(zoneId: number) {
    if (!isAdmin || !confirm('Удалить эту зону?')) return;

    const { error } = await supabase.from('zones').delete().eq('id', zoneId);

    if (error) {
      console.error(error);
      alert('Ошибка удаления зоны');
      return;
    }

    setZones((current) => current.filter((zone) => zone.id !== zoneId));
  }

  async function editZoneDescription(
    zoneId: number,
    currentDescription: string | null
  ) {
    if (!isAdmin) return;

    const description = prompt('Новое описание зоны', currentDescription || '');
    if (description === null) return;

    const { error } = await supabase
      .from('zones')
      .update({ description })
      .eq('id', zoneId);

    if (error) {
      console.error(error);
      alert('Ошибка редактирования зоны');
      return;
    }

    setZones((current) =>
      current.map((zone) =>
        zone.id === zoneId ? { ...zone, description } : zone
      )
    );
  }

  async function loadMarkers() {
    const { data, error } = await supabase
      .from('markers')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setMarkers(data || []);
  }

  async function addMarker(x: number, y: number) {
    if (!isAdmin || creationMode !== 'marker') return;

    const title = prompt('Название метки');
    if (!title) return;

    const description = prompt('Описание') || '';

    const { data, error } = await supabase
      .from('markers')
      .insert({ x, y, title, description })
      .select()
      .single();

    if (error) {
      console.error(error);
      alert('Ошибка сохранения метки');
      return;
    }

    setMarkers((current) => [...current, data as MarkerType]);
    setCreationMode('none');
  }

  async function deleteMarker(markerId: number) {
    if (!isAdmin) return;
    if (!confirm('Удалить метку и все комментарии к ней?')) return;

    const { error } = await supabase
      .from('markers')
      .delete()
      .eq('id', markerId);

    if (error) {
      alert('Ошибка удаления метки');
      console.error(error);
      return;
    }

    setMarkers((current) =>
      current.filter((marker) => marker.id !== markerId)
    );
  }

  async function editMarkerDescription(
    markerId: number,
    currentDescription: string | null
  ) {
    if (!isAdmin) return;

    const newDescription = prompt(
      'Новое описание метки',
      currentDescription || ''
    );

    if (newDescription === null) return;

    const { error } = await supabase
      .from('markers')
      .update({ description: newDescription })
      .eq('id', markerId);

    if (error) {
      alert('Ошибка редактирования метки');
      console.error(error);
      return;
    }

    setMarkers((current) =>
      current.map((marker) =>
        marker.id === markerId
          ? { ...marker, description: newDescription }
          : marker
      )
    );
  }

  useEffect(() => {
    loadMarkers();
    loadZones();
  }, []);

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          zIndex: 1000,
          top: 10,
          right: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
          flexWrap: 'nowrap',
          maxWidth: 'calc(100% - 520px)',
        }}
      >
        <div
          style={{
            position: 'relative',
            flex: '0 1 520px',
            width: 'clamp(280px, 34vw, 520px)',
            minWidth: 0,
          }}
        >
          <input
            placeholder="Найти метку или зону..."
            value={search}
            onFocus={() => setIsSearchOpen(true)}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsSearchOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                openSearchResult();
              }
              if (e.key === 'Escape') {
                setIsSearchOpen(false);
              }
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #ccc',
              width: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
            }}
          />

          {isSearchOpen && suggestions.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                overflow: 'hidden',
                border: '1px solid #b89a70',
                borderRadius: 6,
                background: '#e6d2b5',
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.25)',
              }}
            >
              {suggestions.map((result) => (
                <button
                  key={result.key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => openSearchResult(result)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 10px',
                    border: 0,
                    borderBottom: '1px solid rgba(109, 76, 47, 0.2)',
                    background: 'transparent',
                    color: '#2b1d0e',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {result.type === 'marker' ? '📍' : '▰'} {result.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="map-control-btn"
          onClick={onAdminClick}
          style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
        >
          {isAdmin ? 'Админ ✓' : 'Админ'}
        </button>

        {isAdmin && creationMode === 'none' && (
          <div style={{ position: 'relative', flex: '0 0 auto' }}>
            <button
              className="map-control-btn"
              onClick={() => setIsAddMenuOpen((current) => !current)}
            >
              + Добавить
            </button>

            {isAddMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  minWidth: 160,
                  overflow: 'hidden',
                  border: '1px solid #b89a70',
                  borderRadius: 6,
                  background: '#e6d2b5',
                  boxShadow: '0 8px 20px rgba(0, 0, 0, 0.25)',
                }}
              >
                <button
                  type="button"
                  className="add-menu-item"
                  onClick={startAddingMarker}
                >
                  📍 Метку
                </button>
                <button
                  type="button"
                  className="add-menu-item"
                  onClick={startDrawingZone}
                >
                  ▰ Зону
                </button>
              </div>
            )}
          </div>
        )}

        {isAdmin && creationMode === 'marker' && (
          <>
            <div className="map-mode-hint">Кликните по карте</div>
            <button
              className="map-control-btn map-control-btn-danger"
              onClick={cancelCreation}
            >
              Отмена
            </button>
          </>
        )}

        {isAdmin && creationMode === 'zone' && (
          <>
            <button
              className="map-control-btn"
              onClick={finishDrawingZone}
              disabled={draftZone.length < 3}
            >
              Завершить зону ({draftZone.length})
            </button>
            <button
              className="map-control-btn map-control-btn-danger"
              onClick={cancelCreation}
            >
              Отмена
            </button>
          </>
        )}

      </div>

      <MapContainer
        crs={CRS.Simple}
        bounds={bounds}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        minZoom={-1}
        attributionControl={false}
        doubleClickZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <MapController onReady={(map) => (mapRef.current = map)} />
        <ImageOverlay url="/map.png" bounds={bounds} />

        <MapInteractionHandler
          creationMode={creationMode}
          onAddMarker={addMarker}
          onAddZonePoint={(point) =>
            setDraftZone((current) => [...current, point])
          }
        />

        {zones.map((zone) => (
          <Polygon
            key={zone.id}
            ref={(layer) => {
              if (layer) zoneRefs.current[zone.id] = layer;
            }}
            positions={zone.coordinates}
            pathOptions={{
              color: zone.color,
              fillColor: zone.color,
              fillOpacity: 0.28,
              weight: 3,
            }}
          >
            <Popup minWidth={220} maxWidth={320}>
              <div style={{ width: 260, maxHeight: 180, overflowY: 'auto' }}>
                <h3>{zone.title}</h3>
                <p>{zone.description}</p>

                {isAdmin && (
                  <>
                    <button
                      className="popup-btn"
                      onClick={() =>
                        editZoneDescription(zone.id, zone.description)
                      }
                    >
                      Редактировать описание
                    </button>
                    <button
                      className="popup-btn popup-btn-danger"
                      onClick={() => deleteZone(zone.id)}
                    >
                      Удалить зону
                    </button>
                  </>
                )}
              </div>
            </Popup>
          </Polygon>
        ))}

        {draftZone.length > 0 && (
          <Polygon
            positions={draftZone}
            pathOptions={{
              color: '#f59e0b',
              fillColor: '#f59e0b',
              fillOpacity: 0.2,
              weight: 3,
              dashArray: '8 6',
            }}
          />
        )}

        {markers.map((marker) => {
          const isPopupBelow = marker.y > POPUP_Y_THRESHOLD;
          const popupOffset: [number, number] = isPopupBelow
            ? [0, 270]
            : [0, 60];
          const popupClassName = isPopupBelow
            ? 'popup-below'
            : 'popup-above';

          return (
            <Marker
              key={marker.id}
              ref={(layer) => {
                if (layer) markerRefs.current[marker.id] = layer;
              }}
              position={[marker.y, marker.x]}
              icon={icon}
            >
              <Popup
                className={popupClassName}
                offset={popupOffset}
                minWidth={220}
                maxWidth={320}
                autoPan={true}
                keepInView={false}
                autoPanPadding={[80, 80]}
              >
                <div
                  style={{
                    width: 260,
                    maxHeight: 150,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    paddingRight: 8,
                  }}
                >
                  <h3>{marker.title}</h3>
                  <p>{marker.description}</p>

                  {isAdmin && (
                    <>
                      <button
                        className="popup-btn"
                        onClick={() =>
                          editMarkerDescription(marker.id, marker.description)
                        }
                      >
                        Редактировать описание
                      </button>

                      <button
                        className="popup-btn popup-btn-danger"
                        onClick={() => deleteMarker(marker.id)}
                      >
                        Удалить метку
                      </button>
                    </>
                  )}

                  <Comments markerId={marker.id} isAdmin={isAdmin} />
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
