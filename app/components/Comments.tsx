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
}: {
  markerId: number;
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
        style={{ width: '100%', marginBottom: 5 }}
      />

      <button onClick={addComment}>
        Отправить
      </button>
    </div>
  );
}