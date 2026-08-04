'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import MarketView from './MarketView';
import ResidentsView from './ResidentsView';

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
});

type ActiveTab = 'map' | 'market' | 'residents';

export default function MapClient() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [isAdmin, setIsAdmin] = useState(false);

  function loginAdmin() {
    if (isAdmin) return;

    const password = prompt('Пароль админа');

    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      setIsAdmin(true);
      alert('Админ-режим включён');
      return;
    }

    alert('Неверный пароль');
  }

  return (
    <main className="app-shell">
      <nav className="site-navigation" aria-label="Основная навигация">
        <div className="site-tabs">
          <button
            type="button"
            className={`site-tab ${activeTab === 'map' ? 'site-tab-active' : ''}`}
            onClick={() => setActiveTab('map')}
          >
            Карта
          </button>
          <button
            type="button"
            className={`site-tab ${activeTab === 'market' ? 'site-tab-active' : ''}`}
            onClick={() => setActiveTab('market')}
          >
            Подпольный рынок
          </button>
          <button
            type="button"
            className={`site-tab ${activeTab === 'residents' ? 'site-tab-active' : ''}`}
            onClick={() => setActiveTab('residents')}
          >
            Жители Заккиры
          </button>
        </div>

        {activeTab !== 'map' && (
          <button type="button" className="site-admin-btn" onClick={loginAdmin}>
            {isAdmin ? 'Админ ✓' : 'Админ'}
          </button>
        )}
      </nav>

      <section className="app-content">
        {activeTab === 'map' ? (
          <MapView isAdmin={isAdmin} onAdminClick={loginAdmin} />
        ) : activeTab === 'market' ? (
          <MarketView isAdmin={isAdmin} />
        ) : (
          <ResidentsView isAdmin={isAdmin} />
        )}
      </section>
    </main>
  );
}
