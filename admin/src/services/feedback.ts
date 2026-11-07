import type { SupabaseClient } from '@supabase/supabase-js';
import { requireClient, supabase } from '@/lib/supabase';
import type { NavigationFeedback } from '@/types';

type Client = SupabaseClient | null;

const FEEDBACK_COLUMNS = 'id, session_id, user_id, destination_id, destination_name, rating, comment, created_at';
/** Supabase caps a single response at 1000 rows by default. */
const BATCH_SIZE = 1000;

/** All feedback visible to the signed-in user. RLS limits this to Admins and Editors. */
export async function listNavigationFeedback(client: Client = supabase): Promise<NavigationFeedback[]> {
  const db = requireClient(client);
  const all: NavigationFeedback[] = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    const { data, error } = await db
      .from('navigation_feedback')
      .select(FEEDBACK_COLUMNS)
      .order('created_at', { ascending: false })
      .range(from, from + BATCH_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as NavigationFeedback[];
    all.push(...batch);
    if (batch.length < BATCH_SIZE) return all;
  }
}
