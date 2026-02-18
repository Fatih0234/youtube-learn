import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { z } from 'zod';

const getFlashcardsQuerySchema = z.object({
  youtubeId: z.string().min(1),
});

const flashcardInsertSchema = z.object({
  youtubeId: z.string().min(1),
  selectedText: z.string().min(1).max(500),
  tStart: z.number().int().min(0),
});

const flashcardDeleteSchema = z.object({
  flashcardId: z.string().uuid(),
});

interface FlashcardRow {
  id: string;
  user_id: string;
  video_id: string;
  selected_text: string;
  t_start: number;
  due_at: string;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  video_analyses?: { youtube_id: string } | null;
}

function mapFlashcard(row: FlashcardRow, youtubeId?: string) {
  return {
    id: row.id,
    userId: row.user_id,
    videoId: row.video_id,
    youtubeId: (row.video_analyses?.youtube_id ?? youtubeId) || '',
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
  };
}

async function getHandler(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const { youtubeId } = getFlashcardsQuerySchema.parse({ youtubeId: searchParams.get('youtubeId') });

    // Resolve youtubeId to video_analyses.id
    const { data: videos, error: videoError } = await supabase
      .from('video_analyses')
      .select('id')
      .eq('youtube_id', youtubeId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (videoError) throw videoError;

    const targetVideoId = videos?.[0]?.id;

    if (!targetVideoId) {
      return NextResponse.json({
        flashcards: [],
        stats: { total: 0, newToday: 0, dueToday: 0 },
      });
    }

    // Fetch all flashcards for this user+video
    const { data, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('user_id', user.id)
      .eq('video_id', targetVideoId)
      .order('due_at', { ascending: true });

    if (error) throw error;

    const rows = (data || []) as FlashcardRow[];
    const flashcards = rows.map(row => mapFlashcard(row, youtubeId));

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const stats = {
      total: flashcards.length,
      newToday: flashcards.filter(f => f.createdAt >= todayStart).length,
      dueToday: flashcards.filter(f => f.dueAt <= now.toISOString()).length,
    };

    return NextResponse.json({ flashcards, stats });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid query params' }, { status: 400 });
    }
    console.error('Error fetching flashcards:', error);
    return NextResponse.json({ error: 'Failed to fetch flashcards' }, { status: 500 });
  }
}

async function mutationHandler(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { youtubeId, selectedText, tStart } = flashcardInsertSchema.parse(body);

      // Resolve youtubeId to video_analyses.id
      const { data: videos, error: videoError } = await supabase
        .from('video_analyses')
        .select('id')
        .eq('youtube_id', youtubeId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (videoError) throw videoError;

      const targetVideoId = videos?.[0]?.id;
      if (!targetVideoId) {
        return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      }

      const { data: row, error } = await supabase
        .from('flashcards')
        .insert({
          user_id: user.id,
          video_id: targetVideoId,
          selected_text: selectedText,
          t_start: tStart,
          due_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({ flashcard: mapFlashcard(row as FlashcardRow, youtubeId) }, { status: 201 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
      }
      console.error('Error creating flashcard:', error);
      return NextResponse.json({ error: 'Failed to save flashcard' }, { status: 500 });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const body = await req.json();
      const { flashcardId } = flashcardDeleteSchema.parse(body);

      const { error } = await supabase
        .from('flashcards')
        .delete()
        .eq('id', flashcardId)
        .eq('user_id', user.id);

      if (error) throw error;

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
      }
      console.error('Error deleting flashcard:', error);
      return NextResponse.json({ error: 'Failed to delete flashcard' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export const GET = withSecurity(getHandler, SECURITY_PRESETS.AUTHENTICATED_READ_ONLY);
export const POST = withSecurity(mutationHandler, SECURITY_PRESETS.AUTHENTICATED);
export const DELETE = withSecurity(mutationHandler, SECURITY_PRESETS.AUTHENTICATED);
