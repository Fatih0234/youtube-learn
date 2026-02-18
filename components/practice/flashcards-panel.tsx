"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Flashcard, FlashcardRating, FlashcardStats, TranscriptSegment } from "@/lib/types";
import { fetchFlashcards, reviewFlashcard } from "@/lib/flashcards-client";
import { cn } from "@/lib/utils";
import { BookOpen, RotateCcw } from "lucide-react";

interface FlashcardsPanelProps {
  youtubeId: string;
  isAuthenticated?: boolean;
  onRequestSignIn?: () => void;
  /** Trigger a refresh when a new flashcard has been added externally */
  refreshTrigger?: number;
  /** Full transcript segments, used to show live synced context on the back side */
  transcript?: TranscriptSegment[];
  /** Current playback time from the main YouTube player (seconds) */
  currentTime?: number;
  /** Callback to seek the main YouTube player to a specific timestamp */
  onSeekTo?: (seconds: number) => void;
  /** If provided, called with the due queue instead of starting an internal session */
  onStartSession?: (queue: Flashcard[]) => void;
  /** Whether a cross-tab flashcard session is currently active */
  sessionActive?: boolean;
  /** Progress info for the active session */
  sessionProgress?: { currentIndex: number; total: number } | null;
  /** Called when user exits from the session status bar */
  onExitSession?: () => void;
}

type PracticeView = "dashboard" | "front" | "back";

export function FlashcardsPanel({
  youtubeId,
  isAuthenticated,
  onRequestSignIn,
  refreshTrigger,
  transcript,
  currentTime,
  onSeekTo,
  onStartSession,
  sessionActive,
  sessionProgress,
  onExitSession,
}: FlashcardsPanelProps) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [stats, setStats] = useState<FlashcardStats>({ total: 0, newToday: 0, dueToday: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Practice state
  const [view, setView] = useState<PracticeView>("dashboard");
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRating, setIsRating] = useState(false);

  const loadFlashcards = useCallback(async () => {
    if (!isAuthenticated || !youtubeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchFlashcards(youtubeId);
      setFlashcards(result.flashcards);
      setStats(result.stats);
    } catch {
      setError("Failed to load flashcards");
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, youtubeId]);

  useEffect(() => {
    loadFlashcards();
  }, [loadFlashcards, refreshTrigger]);

  const startPractice = useCallback(() => {
    const now = new Date().toISOString();
    const due = flashcards.filter(f => f.dueAt <= now);
    if (due.length === 0) return;

    if (onStartSession) {
      // Delegate to parent for the cross-tab transcript session
      onStartSession(due);
    } else {
      // Fallback: internal session (no parent handler)
      setQueue(due);
      setCurrentIndex(0);
      setView("front");
    }
  }, [flashcards, onStartSession]);

  const handleRate = useCallback(async (rating: FlashcardRating) => {
    const card = queue[currentIndex];
    if (!card) return;

    setIsRating(true);
    try {
      const updated = await reviewFlashcard(card.id, rating);
      setFlashcards(prev => prev.map(f => f.id === updated.id ? updated : f));

      const nextIndex = currentIndex + 1;
      if (nextIndex >= queue.length) {
        await loadFlashcards();
        setView("dashboard");
      } else {
        setCurrentIndex(nextIndex);
        setView("front");
      }
    } catch {
      setError("Failed to save rating");
    } finally {
      setIsRating(false);
    }
  }, [queue, currentIndex, loadFlashcards]);

  // ── Live transcript hooks (must be declared before any conditional returns) ──
  // These use the currently visible card's timestamp to compute the visible
  // window and highlight the active segment as the main player plays.
  const currentCard = queue[currentIndex];
  const transcriptSegments = transcript || [];

  const visibleSegments = useMemo(() =>
    currentCard
      ? transcriptSegments.filter(
          s => s.start >= currentCard.tStart - 10 && s.start <= currentCard.tStart + 90
        )
      : [],
    [transcriptSegments, currentCard]
  );

  const activeSegmentStart = useMemo(() => {
    const t = currentTime ?? 0;
    let best: number | null = null;
    for (const seg of visibleSegments) {
      if (seg.start <= t) best = seg.start;
      else break;
    }
    return best;
  }, [currentTime, visibleSegments]);

  const activeSegRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    activeSegRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeSegmentStart]);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <BookOpen className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">Sign in to save and practice flashcards</p>
        <Button variant="outline" size="sm" onClick={onRequestSignIn}>
          Sign in
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading flashcards…
      </div>
    );
  }

  // --- DASHBOARD ---
  if (view === "dashboard") {
    const now = new Date().toISOString();
    const dueCount = flashcards.filter(f => f.dueAt <= now).length;

    return (
      <div className="flex flex-col h-full p-6 gap-6">
        <div>
          <h3 className="text-base font-semibold">Flashcards</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Highlight words in the transcript and save them as flashcards
          </p>
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        {sessionActive && sessionProgress && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
            <span className="text-sm font-medium text-primary">
              In session · Card {sessionProgress.currentIndex + 1} / {sessionProgress.total}
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onExitSession}>
              Exit
            </Button>
          </div>
        )}

        {stats.total === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No flashcards yet</p>
            <p className="text-xs text-muted-foreground/70">
              Select a word or phrase in the Transcript tab and click <strong>+ Flashcard</strong>
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Total" value={stats.total} />
              <StatCard label="New today" value={stats.newToday} />
              <StatCard label="Due today" value={dueCount} highlight={dueCount > 0} />
            </div>

            <Button
              onClick={startPractice}
              disabled={dueCount === 0}
              className="w-full"
            >
              {dueCount === 0 ? "No cards due" : `Start Practice (${dueCount})`}
            </Button>
          </>
        )}
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <p className="text-sm font-medium">All done for now!</p>
        <Button variant="outline" size="sm" onClick={() => setView("dashboard")}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Back to dashboard
        </Button>
      </div>
    );
  }

  const cardPosition = `${currentIndex + 1} / ${queue.length}`;

  // --- FRONT ---
  if (view === "front") {
    return (
      <div className="flex flex-col h-full p-6 gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Card {cardPosition}</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setView("dashboard")}>
            Exit
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-4">
            <p className="text-2xl font-semibold tracking-tight break-words">
              {currentCard.selectedText}
            </p>
          </div>
        </div>

        <Button
          onClick={() => {
            onSeekTo?.(currentCard.tStart);
            setView("back");
          }}
          className="w-full"
        >
          Show Answer
        </Button>
      </div>
    );
  }

  // --- BACK ---
  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-y-auto">
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="text-xs text-muted-foreground">Card {cardPosition}</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setView("dashboard")}>
          Exit
        </Button>
      </div>

      <div className="text-center px-4 flex-shrink-0">
        <p className="text-lg font-semibold">{currentCard.selectedText}</p>
      </div>

      {/* Live running transcript synced to the main video player */}
      {visibleSegments.length > 0 && (
        <div className="flex-shrink-0 h-36 overflow-y-auto rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed">
          {visibleSegments.map((seg, i) => {
            const isActive = seg.start === activeSegmentStart;
            return (
              <span
                key={i}
                ref={isActive ? (el) => { activeSegRef.current = el; } : undefined}
                className={cn(
                  "inline transition-colors duration-150",
                  isActive
                    ? "font-semibold text-foreground"
                    : "text-foreground/55"
                )}
              >
                <HighlightedText text={seg.text} phrase={currentCard.selectedText} />
                {" "}
              </span>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 flex-shrink-0">
        {(["again", "hard", "good", "easy"] as FlashcardRating[]).map((rating) => (
          <RatingButton
            key={rating}
            rating={rating}
            disabled={isRating}
            onClick={() => handleRate(rating)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Renders text with all case-insensitive occurrences of phrase highlighted in yellow */
function HighlightedText({ text, phrase }: { text: string; phrase: string }) {
  if (!phrase.trim()) return <>{text}</>;

  const regex = new RegExp(`(${escapeRegExp(phrase)})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = part.toLowerCase() === phrase.toLowerCase();
        return isMatch ? (
          <mark
            key={i}
            className="bg-yellow-200 text-yellow-900 rounded px-0.5 not-italic font-medium"
          >
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn(
      "rounded-xl border p-3 text-center",
      highlight ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"
    )}>
      <p className={cn("text-xl font-bold", highlight ? "text-primary" : "text-foreground")}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

const ratingConfig: Record<FlashcardRating, { label: string; className: string }> = {
  again: { label: "Again", className: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" },
  hard: { label: "Hard", className: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100" },
  good: { label: "Good", className: "border-green-200 bg-green-50 text-green-700 hover:bg-green-100" },
  easy: { label: "Easy", className: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" },
};

function RatingButton({ rating, disabled, onClick }: {
  rating: FlashcardRating;
  disabled?: boolean;
  onClick: () => void;
}) {
  const config = ratingConfig[rating];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg border py-2 text-sm font-medium transition-colors disabled:opacity-50",
        config.className
      )}
    >
      {config.label}
    </button>
  );
}
