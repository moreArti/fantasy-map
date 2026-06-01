'use client';

import { useEffect, useRef, useState } from 'react';
import {
  MapContainer,
  ImageOverlay,
  Marker,
  Popup,
  useMapEvents,
  useMap,
} from 'react-leaflet';

import { CRS } from 'leaflet';
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';

import Comments from './Comments';

const icon = L.icon({
  iconUrl: '/icon.png',

  iconSize: [48, 48],

  iconAnchor: [24, 48],

  popupAnchor: [0, -48],
});

type MarkerType = {
  id: number;
  x: number;
  y: number;
  title: string;
  description: string | null;
};

function ClickHandler({
  onAdd,
}: {
  onAdd: (x: number, y: number) => void;
}) {
  useMapEvents({
    dblclick(e) {
      onAdd(e.latlng.lng, e.latlng.lat);
    },
  });

  return null;
}

function MapController({
  onReady,
}: {
  onReady: (map: L.Map) => void;
}) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}


export default function MapView() {
  const [markers, setMarkers] = useState<MarkerType[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const [search, setSearch] = useState('');
  const suggestions = markers
    .filter((marker) =>
        marker.title.toLowerCase().includes(search.toLowerCase())
    )
    .slice(0, 5);

  const IMAGE_WIDTH = 1920;
  const IMAGE_HEIGHT = 1080;

  const bounds: [[number, number], [number, number]] = [
    [0, 0],
    [IMAGE_HEIGHT, IMAGE_WIDTH],
  ];

  function loginAdmin() {
    const password = prompt('Пароль админа');

    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
        setIsAdmin(true);
        alert('Админ-режим включён');
    } else {
        alert('Неверный пароль');
    }
  }

  function searchMarker(value: string) {
    setSearch(value);
  }

  function openSearchedMarker() {
    const found = markers.find(
        (marker) => marker.title.toLowerCase() === search.toLowerCase()
    );

    if (!found || !mapRef.current) return;

    mapRef.current.setView([found.y, found.x], 0);

    setTimeout(() => {
        const markerElement = document.querySelector(
        `[data-marker-id="${found.id}"]`
        ) as HTMLElement | null;

        markerElement?.click();
    }, 100);
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
    if (!isAdmin) {
        alert('Только админ может добавлять метки');
        return;
    }

    const title = prompt('Название метки');

    if (!title) return;

    const description = prompt('Описание') || '';

    const { data, error } = await supabase
      .from('markers')
      .insert({
        x,
        y,
        title,
        description,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      alert('Ошибка сохранения метки');
      return;
    }

    setMarkers([...markers, data]);
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

    setMarkers(markers.filter((marker) => marker.id !== markerId));
    }

  useEffect(() => {
    loadMarkers();
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
            gap: 8,
        }}
        >
        <input
            list="markers-list"
            placeholder="Найти метку..."
            value={search}
            onChange={(e) => searchMarker(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                openSearchedMarker();
                }
            }}
            style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #ccc',
                minWidth: 220,
            }}
        />

        <datalist id="markers-list">
            {suggestions.map((marker) => (
                <option key={marker.id} value={marker.title} />
            ))}
        </datalist>

        <button onClick={loginAdmin} style={{ padding: '8px 12px' }}>
            Админ
        </button>
        </div>

        <MapContainer
        crs={CRS.Simple}
        bounds={bounds}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        minZoom={0}
        attributionControl={false}
        doubleClickZoom={false}
        style={{ height: '100%', width: '100%' }}
        >
        <MapController onReady={(map) => (mapRef.current = map)} />

        <ImageOverlay url="/map.png" bounds={bounds} />

        <ClickHandler onAdd={addMarker} />

        {markers.map((marker) => (
            <Marker
            key={marker.id}
            position={[marker.y, marker.x]}
            icon={icon}
            eventHandlers={{
                add: (e) => {
                const el = e.target.getElement();
                if (el) {
                    el.setAttribute('data-marker-id', String(marker.id));
                }
                },
            }}
            >
            <Popup
                minWidth={320}
                maxWidth={420}
                autoPan={true}
                keepInView={false}
                autoPanPadding={[80, 80]}
            >
                <div
                style={{
                    width: 360,
                    maxHeight: 150,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    paddingRight: 8,
                }}
                >
                <h3>{marker.title}</h3>

                <p>{marker.description}</p>

                {isAdmin && (
                    <button onClick={() => deleteMarker(marker.id)}>
                    Удалить метку
                    </button>
                )}

                <Comments markerId={marker.id} isAdmin={isAdmin} />
                </div>
            </Popup>
            </Marker>
        ))}
        </MapContainer>
    </div>
  );
}