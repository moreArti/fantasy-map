'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type MarketItem = {
  id: number;
  title: string;
  description: string | null;
  price: string;
  image_url: string;
  image_path: string;
  created_at: string;
};

type MarketForm = {
  title: string;
  description: string;
  price: string;
};

const EMPTY_FORM: MarketForm = {
  title: '',
  description: '',
  price: '',
};

export default function MarketView({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MarketItem | null>(null);
  const [form, setForm] = useState<MarketForm>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');

  async function loadItems() {
    setLoading(true);

    const { data, error } = await supabase
      .from('market_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      alert('Не удалось загрузить товары');
      setLoading(false);
      return;
    }

    setItems((data || []) as MarketItem[]);
    setLoading(false);
  }

  useEffect(() => {
    loadItems();
  }, []);

  function openCreateForm() {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview('');
    setIsFormOpen(true);
  }

  function openEditForm(item: MarketItem) {
    setEditingItem(item);
    setForm({
      title: item.title,
      description: item.description || '',
      price: item.price,
    });
    setImageFile(null);
    setImagePreview(item.image_url);
    setIsFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setIsFormOpen(false);
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview('');
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setImageFile(file);

    if (!file) {
      setImagePreview(editingItem?.image_url || '');
      return;
    }

    setImagePreview(URL.createObjectURL(file));
  }

  async function uploadImage(file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${Date.now()}-${crypto.randomUUID()}.${safeExtension}`;

    const { error } = await supabase.storage
      .from('market-images')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage.from('market-images').getPublicUrl(path);

    return {
      imagePath: path,
      imageUrl: data.publicUrl,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAdmin || saving) return;

    const title = form.title.trim();
    const price = form.price.trim();
    const description = form.description.trim();

    if (!title || !price) {
      alert('Заполните название и цену');
      return;
    }

    if (!editingItem && !imageFile) {
      alert('Выберите изображение товара');
      return;
    }

    setSaving(true);
    let uploadedImage: { imagePath: string; imageUrl: string } | null = null;

    try {
      if (imageFile) {
        uploadedImage = await uploadImage(imageFile);
      }

      if (editingItem) {
        const updatePayload = {
          title,
          description,
          price,
          image_url: uploadedImage?.imageUrl || editingItem.image_url,
          image_path: uploadedImage?.imagePath || editingItem.image_path,
        };

        const { data, error } = await supabase
          .from('market_items')
          .update(updatePayload)
          .eq('id', editingItem.id)
          .select()
          .single();

        if (error) throw error;

        setItems((current) =>
          current.map((item) =>
            item.id === editingItem.id ? (data as MarketItem) : item
          )
        );

        if (uploadedImage && editingItem.image_path) {
          await supabase.storage
            .from('market-images')
            .remove([editingItem.image_path]);
        }
      } else {
        if (!uploadedImage) throw new Error('Изображение не было загружено');

        const { data, error } = await supabase
          .from('market_items')
          .insert({
            title,
            description,
            price,
            image_url: uploadedImage.imageUrl,
            image_path: uploadedImage.imagePath,
          })
          .select()
          .single();

        if (error) throw error;

        setItems((current) => [data as MarketItem, ...current]);
      }

      setIsFormOpen(false);
      setEditingItem(null);
      setForm(EMPTY_FORM);
      setImageFile(null);
      setImagePreview('');
    } catch (error) {
      console.error(error);

      if (uploadedImage) {
        await supabase.storage
          .from('market-images')
          .remove([uploadedImage.imagePath]);
      }

      alert('Не удалось сохранить товар');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item: MarketItem) {
    if (!isAdmin || !confirm(`Удалить товар «${item.title}»?`)) return;

    const { error } = await supabase
      .from('market_items')
      .delete()
      .eq('id', item.id);

    if (error) {
      console.error(error);
      alert('Не удалось удалить товар');
      return;
    }

    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));

    if (item.image_path) {
      const { error: storageError } = await supabase.storage
        .from('market-images')
        .remove([item.image_path]);

      if (storageError) console.error(storageError);
    }
  }

  return (
    <div className="market-page">
      <header className="market-header">
        <div>
          <p className="market-kicker">Тайные прилавки Заккиры</p>
          <h1>Подпольный рынок</h1>
        </div>

        {isAdmin && (
          <button type="button" className="market-add-btn" onClick={openCreateForm}>
            + Добавить товар
          </button>
        )}
      </header>

      {loading ? (
        <div className="market-status">Загрузка товаров…</div>
      ) : items.length === 0 ? (
        <div className="market-status">
          На прилавках пока пусто.
          {isAdmin ? ' Добавьте первый товар.' : ''}
        </div>
      ) : (
        <div className="market-grid">
          {items.map((item) => (
            <article key={item.id} className="market-card">
              <div className="market-card-image-wrap">
                {/* Используем обычный img, потому что Supabase URL динамический. */}
                <img
                  className="market-card-image"
                  src={item.image_url}
                  alt={item.title}
                  loading="lazy"
                />
              </div>

              <div className="market-card-body">
                <h2>{item.title}</h2>
                <p className="market-card-description">
                  {item.description || 'Описание отсутствует.'}
                </p>
                <div className="market-card-footer">
                  <strong className="market-price">{item.price}</strong>

                  {isAdmin && (
                    <div className="market-admin-actions">
                      <button
                        type="button"
                        className="market-small-btn"
                        onClick={() => openEditForm(item)}
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        className="market-small-btn market-small-btn-danger"
                        onClick={() => deleteItem(item)}
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {isFormOpen && (
        <div className="market-modal-backdrop" onMouseDown={closeForm}>
          <div
            className="market-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="market-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="market-modal-header">
              <h2 id="market-form-title">
                {editingItem ? 'Редактировать товар' : 'Добавить товар'}
              </h2>
              <button
                type="button"
                className="market-modal-close"
                onClick={closeForm}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <form className="market-form" onSubmit={handleSubmit}>
              <label>
                Изображение
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleImageChange}
                  required={!editingItem}
                />
              </label>

              {imagePreview && (
                <img className="market-form-preview" src={imagePreview} alt="Предпросмотр" />
              )}

              <label>
                Название
                <input
                  type="text"
                  value={form.title}
                  maxLength={120}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Описание
                <textarea
                  value={form.description}
                  rows={5}
                  maxLength={2000}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Цена
                <input
                  type="text"
                  value={form.price}
                  maxLength={80}
                  placeholder="Например: 25 серебряных"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, price: event.target.value }))
                  }
                  required
                />
              </label>

              <div className="market-form-actions">
                <button type="button" className="market-secondary-btn" onClick={closeForm}>
                  Отмена
                </button>
                <button type="submit" className="market-submit-btn" disabled={saving}>
                  {saving ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
