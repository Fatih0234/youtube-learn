import { csrfFetch } from '@/lib/csrf-client';
import { Flashcard, FlashcardRating, FlashcardStats } from '@/lib/types';

export interface FetchFlashcardsResult {
  flashcards: Flashcard[];
  stats: FlashcardStats;
}

export async function fetchFlashcards(youtubeId: string): Promise<FetchFlashcardsResult> {
  const query = new URLSearchParams({ youtubeId });
  const response = await csrfFetch.get(`/api/flashcards?${query.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to fetch flashcards');
  }

  const data = await response.json();
  return {
    flashcards: (data.flashcards || []) as Flashcard[],
    stats: data.stats as FlashcardStats,
  };
}

export async function saveFlashcard(payload: {
  youtubeId: string;
  selectedText: string;
  tStart: number;
}): Promise<Flashcard> {
  const response = await csrfFetch.post('/api/flashcards', payload);

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save flashcard');
  }

  const data = await response.json();
  return data.flashcard as Flashcard;
}

export async function deleteFlashcard(flashcardId: string): Promise<void> {
  const response = await csrfFetch.delete('/api/flashcards', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flashcardId }),
  });

  if (!response.ok) {
    throw new Error('Failed to delete flashcard');
  }
}

export async function reviewFlashcard(
  flashcardId: string,
  rating: FlashcardRating
): Promise<Flashcard> {
  const response = await csrfFetch.post('/api/flashcards/review', { flashcardId, rating });

  if (!response.ok) {
    throw new Error('Failed to update flashcard');
  }

  const data = await response.json();
  return data.flashcard as Flashcard;
}
