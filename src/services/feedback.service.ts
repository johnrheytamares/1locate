import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
export interface Feedback { id: string; destination_id: string; destination_name: string; rating: number; }
const KEY = '1locate-pending-feedback-v1';
function pending(): Feedback[] { try { const value = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && typeof item.destination_id === 'string' && typeof item.destination_name === 'string' && Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5).slice(0, 50) : []; } catch { return []; } }
export async function sendFeedback(item: Feedback, client: SupabaseClient | null = supabase): Promise<'sent' | 'queued'> {
  if (!Number.isInteger(item.rating) || item.rating < 1 || item.rating > 5) throw new Error('Choose a rating from 1 to 5.');
  if (client) try {
    const { error } = await client.from('navigation_feedback').insert(item).abortSignal(AbortSignal.timeout(8000));
    if (!error || error.code === '23505') return 'sent';
  } catch { /* Keep a failed submission for a later connection. */ }
  try { const items = pending().filter(value => value.id !== item.id); if (items.length >= 50) throw new Error(); localStorage.setItem(KEY, JSON.stringify([...items, item])); }
  catch { throw new Error('Feedback could not be saved. Try again when connected.'); }
  return 'queued';
}
export async function flushFeedback(client: SupabaseClient | null = supabase) {
  if (!client) return;
  for (const item of pending()) {
    try {
      const { error } = await client.from('navigation_feedback').insert(item).abortSignal(AbortSignal.timeout(8000));
      if (error && error.code !== '23505') return;
      localStorage.setItem(KEY, JSON.stringify(pending().filter(value => value.id !== item.id)));
    } catch { return; }
  }
}
