'use client';

import { useEffect, useState } from 'react';
import {
  MapContainer,
  ImageOverlay,
  Marker,
  Popup,
  useMapEvents,
} from 'react-leaflet';

import { CRS } from 'leaflet';
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';

import Comments from './Comments';

const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
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
    click(e) {
      onAdd(e.latlng.lng, e.latlng.lat);
    },
  });

  return null;
}

export default function MapView() {
  const [markers, setMarkers] = useState<MarkerType[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const bounds: [[number, number], [number, number]] = [
    [0, 0],
    [1000, 1000],
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
    <div style={{ height: '100vh', width: '100%' }}>
        <button
            onClick={loginAdmin}
            style={{
                position: 'absolute',
                zIndex: 1000,
                top: 10,
                right: 10,
                padding: '8px 12px',
            }}
        >
            Админ
        </button>
      <MapContainer
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        minZoom={0}
        attributionControl={false}
        crs={CRS.Simple}
        bounds={bounds}
        style={{ height: '100%', width: '100%' }}
      >
        <ImageOverlay url="/map.jpg" bounds={bounds} />

        <ClickHandler onAdd={addMarker} />

        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.y, marker.x]}
            icon={icon}
          >
            <Popup>
              <h3>{marker.title}</h3>
              <p>{marker.description}</p>
              {isAdmin && (
                <button onClick={() => deleteMarker(marker.id)}>
                    Удалить метку
                </button>
                )}

              <Comments markerId={marker.id} isAdmin={isAdmin} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}