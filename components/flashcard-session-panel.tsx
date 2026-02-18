"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Flashcard, FlashcardRating } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FlashcardSessionPanelProps {
  card: Flashcard;
  currentIndex: number;
  total: number;
  contextText: string;
  onRate: (rating: FlashcardRating) => Promise<void>;
  onExit: () => void;
}

type CardView = "front" | "back";

export function FlashcardSessionPanel({
  card,
  currentIndex,
  total,
  contextText,
  onRate,
  onExit,
}: FlashcardSessionPanelProps) {
  const [view, setView] = useState<CardView>("front");
  const [isRating, setIsRating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to front whenever the card changes
  useEffect(() => {
    setView("front");
    setError(null);
  }, [card.id]);

  const handleRate = async (rating: FlashcardRating) => {
    setIsRating(true);
    setError(null);
    try {
      await onRate(rating);
    } catch {
      setError("Failed to save rating. Try again.");
    } finally {
      setIsRating(false);
    }
  };

  const cardPosition = `${currentIndex + 1} / ${total}`;

  return (
    <div className="border-t bg-background flex-shrink-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Card {cardPosition}
          </span>
          {/* Progress dots */}
          <div className="flex gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  i < currentIndex
                    ? "bg-primary/40"
                    : i === currentIndex
                    ? "bg-primary"
                    : "bg-muted-foreground/20"
                )}
              />
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={onExit}
        >
          Exit
        </Button>
      </div>

      {view === "front" ? (
        /* Front of card */
        <div className="flex flex-col items-center justify-center px-6 py-5 gap-4">
          <p className="text-xl font-semibold tracking-tight text-center break-words">
            {card.selectedText}
          </p>
          <Button
            onClick={() => setView("back")}
            className="w-full max-w-xs"
          >
            Show Answer
          </Button>
        </div>
      ) : (
        /* Back of card */
        <div className="flex flex-col px-4 py-3 gap-3">
          <p className="text-sm font-semibold text-center">{card.selectedText}</p>

          {contextText && (
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-foreground/70 max-h-20 overflow-y-auto">
              <HighlightedText text={contextText} phrase={card.selectedText} />
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}

          <div className="grid grid-cols-4 gap-2">
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
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

const ratingConfig: Record<FlashcardRating, { label: string; className: string }> = {
  again: { label: "Again", className: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" },
  hard: { label: "Hard", className: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100" },
  good: { label: "Good", className: "border-green-200 bg-green-50 text-green-700 hover:bg-green-100" },
  easy: { label: "Easy", className: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" },
};

function RatingButton({
  rating,
  disabled,
  onClick,
}: {
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
