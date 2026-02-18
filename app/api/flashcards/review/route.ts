import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { z } from 'zod';

const reviewSchema = z.object({
  flashcardId: z.string().uuid(),
  rating: z.enum(['again', 'hard', 'good', 'easy']),
});

function computeNextSchedule(
  currentIntervalDays: number,
  currentLapses: number,
  rating: 'again' | 'hard' | 'good' | 'easy'
): { intervalDays: number; dueAt: Date; lapses: number } {
  let intervalDays = currentIntervalDays;
  let lapses = currentLapses;
  const now = new Date();

  switch (rating) {
    case 'again':
      intervalDays = 0;
      lapses += 1;
      return { intervalDays, dueAt: now, lapses };
    case 'hard':
      intervalDays = Math.max(1, intervalDays + 1);
      break;
    case 'good':
      intervalDays = Math.max(1, Math.round(intervalDays * 2) || 1);
      break;
    case 'easy':
      intervalDays = Math.max(2, Math.round(intervalDays * 3) || 2);
      break;
  }

  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + intervalDays);
  return { intervalDays, dueAt, lapses };
}

async function handler(req: NextRequest) {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { flashcardId, rating } = reviewSchema.parse(body);

    // Fetch current card to get existing scheduling values
    const { data: existing, error: fetchError } = await supabase
      .from('flashcards')
      .select('interval_days, lapses, reps')
      .eq('id', flashcardId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Flashcard not found' }, { status: 404 });
    }

    const { intervalDays, dueAt, lapses } = computeNextSchedule(
      existing.interval_days,
      existing.lapses,
      rating
    );

    const { data: updated, error: updateError } = await supabase
      .from('flashcards')
      .update({
        interval_days: intervalDays,
        due_at: dueAt.toISOString(),
        lapses,
        reps: existing.reps + 1,
        last_reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', flashcardId)
      .eq('user_id', user.id)
      .select('*, video_analyses(youtube_id)')
      .single();

    if (updateError) throw updateError;

    const row = updated as any;
    return NextResponse.json({
      flashcard: {
        id: row.id,
        userId: row.user_id,
        videoId: row.video_id,
        youtubeId: row.video_analyses?.youtube_id || '',
        selectedText: row.selected_text,
        tStart: row.t_start,
        dueAt: row.due_at,
        intervalDays: row.interval_days,
        ease: row.ease,
        reps: row.reps,
        lapses: row.lapses,
        lastReviewedAt: row.last_reviewed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }
    console.error('Error reviewing flashcard:', error);
    return NextResponse.json({ error: 'Failed to update flashcard' }, { status: 500 });
  }
}

export const POST = withSecurity(handler, SECURITY_PRESETS.AUTHENTICATED);
