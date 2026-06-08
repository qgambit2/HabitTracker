// Supabase Edge Function: `coach`
//
// AI coaching for HabitTracker. The phone invokes this with the signed-in user's
// JWT; the function reads that user's habits/challenges from the DB (RLS-scoped),
// computes streaks + consistency, and asks Claude (Sonnet 4.6) for either a short
// daily nudge or a weekly/monthly reflection. Results are cached in `insights` so
// we don't re-pay the Anthropic API on every app open, and so generation is
// throttled (one nudge/day, one weekly/6d, one monthly/27d).
//
// Architecture (matches the design diagram):
//   Phone → this function → Claude API ;  this function ⇄ Supabase DB
//
// Secrets (set via `supabase secrets set`): ANTHROPIC_API_KEY.
// SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform.

import { createClient } from 'jsr:@supabase/supabase-js@2';

type InsightType = 'nudge' | 'weekly' | 'monthly';

const MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// How fresh a cached insight must be to skip regeneration, in milliseconds.
const THROTTLE_MS: Record<InsightType, number> = {
  nudge: 20 * 60 * 60 * 1000, // ~daily
  weekly: 6 * 24 * 60 * 60 * 1000, // ~weekly
  monthly: 27 * 24 * 60 * 60 * 1000, // ~monthly
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ---- DB row shapes (snake_case, as stored) --------------------------------

type HabitRow = {
  id: string;
  name: string;
  emoji: string;
  kind: string;
  target: number;
  log: Record<string, number>;
};

type ChallengeRow = {
  id: string;
  title: string;
  habit_id: string | null;
  length_days: number;
  start_date: string;
  progress_dates: string[];
  status: string;
};

// ---- date + derivation helpers (mirror hooks/use-habits.ts) ---------------

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastNDays(count: number): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(toISODate(d));
  }
  return days;
}

function isDayComplete(h: HabitRow, iso: string): boolean {
  return (h.log?.[iso] ?? 0) >= h.target;
}

/** Consecutive-day streak ending today (or yesterday), mirroring use-habits. */
function currentStreak(h: HabitRow): number {
  const completed = new Set(Object.keys(h.log ?? {}).filter((iso) => isDayComplete(h, iso)));
  let streak = 0;
  const cursor = new Date();
  if (!completed.has(toISODate(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (completed.has(toISODate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Percentage of the last `window` days this habit was completed (0–100, rounded). */
function consistency(h: HabitRow, windowDays: number): number {
  const days = lastNDays(windowDays);
  const done = days.filter((iso) => isDayComplete(h, iso)).length;
  return Math.round((done / windowDays) * 100);
}

type HabitFeature = {
  name: string;
  kind: string;
  target: number;
  streak: number;
  doneToday: boolean;
  last7Pct: number;
  last30Pct: number;
};

function buildFeatures(habits: HabitRow[], challenges: ChallengeRow[]) {
  const today = toISODate(new Date());
  const habitFeatures: HabitFeature[] = habits.map((h) => ({
    name: h.name,
    kind: h.kind,
    target: h.target,
    streak: currentStreak(h),
    doneToday: isDayComplete(h, today),
    last7Pct: consistency(h, 7),
    last30Pct: consistency(h, 30),
  }));

  const challengeFeatures = challenges
    .filter((c) => c.status === 'active' || c.status === 'completed')
    .map((c) => ({
      title: c.title,
      status: c.status,
      lengthDays: c.length_days,
      daysDone: (c.progress_dates ?? []).length,
    }));

  return { date: today, habits: habitFeatures, challenges: challengeFeatures };
}

// ---- prompts --------------------------------------------------------------

const SYSTEM_NUDGE = `You are a supportive, perceptive habit coach inside a habit-tracking app.
Given a JSON snapshot of the user's habits (streaks, today's status, and 7- and 30-day consistency percentages) and challenges, write ONE short motivational nudge.

Rules:
- 1–2 sentences, max ~40 words. Plain, warm, direct — like a thoughtful friend, not a hype machine.
- Be SPECIFIC: reference real habit names and real numbers from the data (e.g. a strong streak, or a habit slipping). Contrast a strength with something to nudge when the data supports it.
- No greeting, no sign-off, no markdown, at most one emoji and only if it fits.
- If today is going well, acknowledge it; if something is slipping, encourage gently without guilt.`;

const SYSTEM_REFLECTION = (period: 'week' | 'month') => `You are a supportive, perceptive habit coach inside a habit-tracking app.
Given a JSON snapshot of the user's habits (streaks, today's status, and 7- and 30-day consistency percentages) and challenges, write a brief ${period}ly reflection summary.

Rules:
- 3–5 short sentences (or 3–4 compact bullet lines). Reference real habit names and real consistency numbers.
- Lead with what went well (the most consistent habit), then name what dropped off, then one concrete suggestion for next ${period}.
- Honest and encouraging, not preachy. No greeting or sign-off. Light markdown (a few "- " bullets) is fine; no headings.`;

function systemFor(type: InsightType): string {
  if (type === 'weekly') return SYSTEM_REFLECTION('week');
  if (type === 'monthly') return SYSTEM_REFLECTION('month');
  return SYSTEM_NUDGE;
}

// ---- Anthropic call -------------------------------------------------------

async function callClaude(type: InsightType, features: unknown, apiKey: string): Promise<string> {
  const maxTokens = type === 'nudge' ? 400 : 700;
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      // No extended thinking: these are short (1–2 sentence nudge / brief reflection)
      // outputs, so reasoning tokens would just add latency/cost and risk consuming the
      // budget before any visible text is produced.
      system: systemFor(type),
      messages: [
        {
          role: 'user',
          content: `Here is the user's current habit data as JSON:\n\n${JSON.stringify(
            features,
          )}\n\nWrite the ${type === 'nudge' ? 'nudge' : type + ' reflection'} now.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  // Concatenate text blocks (skip any thinking blocks, which carry no visible text by default).
  const text: string = (data.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
    .trim();
  if (!text) throw new Error('Anthropic returned no text content');
  return text;
}

// ---- handler --------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  let type: InsightType = 'nudge';
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.type === 'weekly' || body?.type === 'monthly' || body?.type === 'nudge') {
      type = body.type;
    }
  } catch {
    // default to nudge
  }

  // RLS-scoped client: forward the caller's JWT so every query is restricted to their rows.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // Identify the user (also rejects an invalid/expired token).
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Invalid session' }, 401);

  // Throttle: reuse a recent insight of this type if one exists.
  const { data: recent } = await supabase
    .from('insights')
    .select('id, type, content, created_at')
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    const age = Date.now() - new Date(recent.created_at).getTime();
    if (age < THROTTLE_MS[type]) {
      return json({ insight: recent, cached: true });
    }
  }

  // Read the user's data (RLS scopes both to the caller).
  const [habitsRes, challengesRes] = await Promise.all([
    supabase.from('habits').select('id, name, emoji, kind, target, log'),
    supabase
      .from('challenges')
      .select('id, title, habit_id, length_days, start_date, progress_dates, status'),
  ]);

  if (habitsRes.error || challengesRes.error) {
    return json({ error: 'Could not read habit data' }, 500);
  }

  const habits = (habitsRes.data as HabitRow[]) ?? [];
  const challenges = (challengesRes.data as ChallengeRow[]) ?? [];

  // No habits yet — return a friendly starter message without calling Claude.
  if (habits.length === 0) {
    const content =
      type === 'nudge'
        ? 'Add your first habit to start a streak — once you have a day or two logged, I can coach you with specifics.'
        : "There's nothing to reflect on yet. Add a habit and check it off for a few days, then come back for a summary.";
    const { data: inserted, error: insErr } = await supabase
      .from('insights')
      .insert({ user_id: userData.user.id, type, content })
      .select('id, type, content, created_at')
      .single();
    if (insErr) return json({ error: 'Could not save insight' }, 500);
    return json({ insight: inserted, cached: false });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Coaching is not configured' }, 500);

  const features = buildFeatures(habits, challenges);

  let content: string;
  try {
    content = await callClaude(type, features, apiKey);
  } catch (e) {
    // The real cause is logged server-side; the client gets a friendly message.
    console.error('Claude call failed:', e);
    return json({ error: 'Coaching unavailable, try again in a moment' }, 502);
  }

  const { data: inserted, error: insErr } = await supabase
    .from('insights')
    .insert({ user_id: userData.user.id, type, content })
    .select('id, type, content, created_at')
    .single();
  if (insErr) {
    console.error('Insert failed:', insErr);
    return json({ error: 'Could not save insight' }, 500);
  }

  return json({ insight: inserted, cached: false });
});
