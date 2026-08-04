'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Resident = {
  id: number;
  name: string;
  description: string | null;
  image_url: string;
  image_path: string;
  created_at: string;
};

type ResidentForm = {
  name: string;
  description: string;
};

const EMPTY_FORM: ResidentForm = {
  name: '',
  description: '',
};

export default function ResidentsView({ isAdmin }: { isAdmin: boolean }) {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingResident, setEditingResident] = useState<Resident | null>(null);
  const [form, setForm] = useState<ResidentForm>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');

  async function loadResidents() {
    setLoading(true);

    const { data, error } = await supabase
      .from('residents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      alert('Не удалось загрузить жителей');
      setLoading(false);
      return;
    }

    setResidents((data || []) as Resident[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadResidents();
  }, []);

  function openCreateForm() {
    setEditingResident(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview('');
    setIsFormOpen(true);
  }

  function openEditForm(resident: Resident) {
    setEditingResident(resident);
    setForm({
      name: resident.name,
      description: resident.description || '',
    });
    setImageFile(null);
    setImagePreview(resident.image_url);
    setIsFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setIsFormOpen(false);
    setEditingResident(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview('');
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setImageFile(file);

    if (!file) {
      setImagePreview(editingResident?.image_url || '');
      return;
    }

    setImagePreview(URL.createObjectURL(file));
  }

  async function uploadImage(file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${Date.now()}-${crypto.randomUUID()}.${safeExtension}`;

    const { error } = await supabase.storage
      .from('resident-images')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage.from('resident-images').getPublicUrl(path);

    return {
      imagePath: path,
      imageUrl: data.publicUrl,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAdmin || saving) return;

    const name = form.name.trim();
    const description = form.description.trim();

    if (!name) {
      alert('Введите имя персонажа');
      return;
    }

    if (!editingResident && !imageFile) {
      alert('Выберите изображение персонажа');
      return;
    }

    setSaving(true);
    let uploadedImage: { imagePath: string; imageUrl: string } | null = null;

    try {
      if (imageFile) {
        uploadedImage = await uploadImage(imageFile);
      }

      if (editingResident) {
        const updatePayload = {
          name,
          description,
          image_url: uploadedImage?.imageUrl || editingResident.image_url,
          image_path: uploadedImage?.imagePath || editingResident.image_path,
        };

        const { data, error } = await supabase
          .from('residents')
          .update(updatePayload)
          .eq('id', editingResident.id)
          .select()
          .single();

        if (error) throw error;

        setResidents((current) =>
          current.map((resident) =>
            resident.id === editingResident.id ? (data as Resident) : resident
          )
        );

        if (uploadedImage && editingResident.image_path) {
          await supabase.storage
            .from('resident-images')
            .remove([editingResident.image_path]);
        }
      } else {
        if (!uploadedImage) throw new Error('Изображение не было загружено');

        const { data, error } = await supabase
          .from('residents')
          .insert({
            name,
            description,
            image_url: uploadedImage.imageUrl,
            image_path: uploadedImage.imagePath,
          })
          .select()
          .single();

        if (error) throw error;

        setResidents((current) => [data as Resident, ...current]);
      }

      closeForm();
    } catch (error) {
      console.error(error);

      if (uploadedImage) {
        await supabase.storage
          .from('resident-images')
          .remove([uploadedImage.imagePath]);
      }

      alert('Не удалось сохранить карточку жителя');
    } finally {
      setSaving(false);
    }
  }

  async function deleteResident(resident: Resident) {
    if (!isAdmin || !confirm(`Удалить жителя «${resident.name}»?`)) return;

    const { error } = await supabase
      .from('residents')
      .delete()
      .eq('id', resident.id);

    if (error) {
      console.error(error);
      alert('Не удалось удалить жителя');
      return;
    }

    setResidents((current) => current.filter((item) => item.id !== resident.id));

    if (resident.image_path) {
      const { error: storageError } = await supabase.storage
        .from('resident-images')
        .remove([resident.image_path]);

      if (storageError) console.error(storageError);
    }
  }

  return (
    <div className="residents-page">
      <header className="residents-header">
        <div>
          <p className="residents-kicker">Лица города</p>
          <h1>Жители Заккиры</h1>
        </div>

        {isAdmin && (
          <button type="button" className="residents-add-btn" onClick={openCreateForm}>
            + Добавить жителя
          </button>
        )}
      </header>

      {loading ? (
        <div className="residents-status">Загрузка жителей…</div>
      ) : residents.length === 0 ? (
        <div className="residents-status">
          Здесь пока никто не представлен.
          {isAdmin ? ' Добавьте первого жителя.' : ''}
        </div>
      ) : (
        <div className="residents-grid">
          {residents.map((resident) => (
            <article key={resident.id} className="resident-card">
              <div className="resident-card-image-wrap">
                <img
                  className="resident-card-image"
                  src={resident.image_url}
                  alt={resident.name}
                  loading="lazy"
                />
              </div>

              <div className="resident-card-body">
                <h2>{resident.name}</h2>
                <p>{resident.description || 'Описание отсутствует.'}</p>

                {isAdmin && (
                  <div className="resident-admin-actions">
                    <button
                      type="button"
                      className="resident-small-btn"
                      onClick={() => openEditForm(resident)}
                    >
                      Редактировать
                    </button>
                    <button
                      type="button"
                      className="resident-small-btn resident-small-btn-danger"
                      onClick={() => deleteResident(resident)}
                    >
                      Удалить
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {isFormOpen && (
        <div className="residents-modal-backdrop" onMouseDown={closeForm}>
          <div
            className="residents-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resident-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="residents-modal-header">
              <h2 id="resident-form-title">
                {editingResident ? 'Редактировать жителя' : 'Добавить жителя'}
              </h2>
              <button
                type="button"
                className="residents-modal-close"
                onClick={closeForm}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <form className="residents-form" onSubmit={handleSubmit}>
              <label>
                Изображение
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleImageChange}
                  required={!editingResident}
                />
              </label>

              {imagePreview && (
                <img
                  className="residents-form-preview"
                  src={imagePreview}
                  alt="Предпросмотр"
                />
              )}

              <label>
                Имя персонажа
                <input
                  type="text"
                  value={form.name}
                  maxLength={120}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Краткое описание
                <textarea
                  value={form.description}
                  rows={5}
                  maxLength={1200}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="residents-form-actions">
                <button type="button" className="residents-secondary-btn" onClick={closeForm}>
                  Отмена
                </button>
                <button type="submit" className="residents-submit-btn" disabled={saving}>
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
