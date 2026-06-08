import { supabase } from '@/lib/supabase';

/**
 * Client side of AI coaching. The heavy lifting (reading habit data, calling Claude,
 * caching) happens in the `coach` Supabase Edge Function; this module just invokes it
 * and reads back the cached `insights` rows for display.
 *
 * No cross-screen store is needed — the Coach screen owns its own state and calls these
 * functions directly (unlike use-habits/use-auth, which several screens share).
 */

export type InsightType = 'nudge' | 'weekly' | 'monthly';

export type Insight = {
  id: string;
  type: InsightType;
  content: string;
  created_at: string;
};

type InsightRow = {
  id: string;
  type: string;
  content: string;
  created_at: string;
};

function rowToInsight(r: InsightRow): Insight {
  return { id: r.id, type: r.type as InsightType, content: r.content, created_at: r.created_at };
}

export type GenerateResult =
  | { insight: Insight; cached: boolean; error: null }
  | { insight: null; cached: false; error: string };

/**
 * Ask the edge function to produce (or return a cached) insight of the given type.
 * The function throttles server-side, so calling this on every app open is cheap —
 * it only hits Claude when the previous insight of this type has aged out.
 */
export async function generateInsight(type: InsightType): Promise<GenerateResult> {
  const { data, error } = await supabase.functions.invoke('coach', { body: { type } });

  if (error) {
    // The function returns a JSON { error } body on failure; surface it if present.
    let message = 'Coaching unavailable, try again.';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      }
    } catch {
      // fall back to the generic message
    }
    return { insight: null, cached: false, error: message };
  }

  const insight = (data as { insight?: InsightRow })?.insight;
  if (!insight) return { insight: null, cached: false, error: 'Coaching unavailable, try again.' };

  return {
    insight: rowToInsight(insight),
    cached: Boolean((data as { cached?: boolean })?.cached),
    error: null,
  };
}

/**
 * Read the newest cached insight of each type straight from the table (RLS-scoped to the
 * signed-in user) — fast display without invoking the function. The reflection slot is the
 * newer of the latest weekly/monthly.
 */
export async function fetchLatestInsights(): Promise<{
  nudge: Insight | null;
  reflection: Insight | null;
}> {
  const { data, error } = await supabase
    .from('insights')
    .select('id, type, content, created_at')
    .order('created_at', { ascending: false });

  if (error || !data) return { nudge: null, reflection: null };

  const rows = data as InsightRow[];
  const nudge = rows.find((r) => r.type === 'nudge') ?? null;
  const reflection = rows.find((r) => r.type === 'weekly' || r.type === 'monthly') ?? null;

  return {
    nudge: nudge ? rowToInsight(nudge) : null,
    reflection: reflection ? rowToInsight(reflection) : null,
  };
}
