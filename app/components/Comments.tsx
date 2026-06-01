'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type CommentType = {
  id: number;
  username: string;
  text: string;
};

export default function Comments({
  markerId,
  isAdmin,
}: {
  markerId: number;
  isAdmin: boolean;
}) {
  const [comments, setComments] = useState<CommentType[]>([]);
  const [name, setName] = useState('');
  const [text, setText] = useState('');

  async function loadComments() {
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('marker_id', markerId)
      .order('created_at', { ascending: true });

    setComments(data || []);
  }

  async function addComment() {
    if (!name || !text) return;

    const { data, error } = await supabase
      .from('comments')
      .insert({
        marker_id: markerId,
        username: name,
        text,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setComments([...comments, data]);

    setText('');
  }

  async function deleteComment(commentId: number) {
    if (!confirm('Удалить комментарий?')) return;

    const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

    if (error) {
        alert('Ошибка удаления комментария');
        console.error(error);
        return;
    }

    setComments(comments.filter((comment) => comment.id !== commentId));
    }

  useEffect(() => {
    loadComments();
  }, []);

  return (
    <div style={{ minWidth: 250 }}>
      <hr />

      <h4>Комментарии</h4>

      {comments.map((comment) => (
        <div key={comment.id} style={{ marginBottom: 10 }}>
          <b>{comment.username}</b>
          <div>{comment.text}</div>
          {isAdmin && (
        <button onClick={() => deleteComment(comment.id)}>
            Удалить
        </button>
        )}
        </div>
      ))}

      <input
        placeholder="Ваше имя"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width: '100%', marginBottom: 5 }}
      />

      <textarea
        placeholder="Комментарий"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ width: '100%', marginBottom: 5, resize: 'none', }}
      />

      <button onClick={addComment}>
        Отправить
      </button>
    </div>
  );
}