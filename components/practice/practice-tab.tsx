"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PracticeMode, Topic, TranscriptSegment, Flashcard } from "@/lib/types";
import { QuizPanel } from "./quiz-panel";
import { RoleplayPanel } from "./roleplay-panel";
import { WritingPanel } from "./writing-panel";
import { FlashcardsPanel } from "./flashcards-panel";
import { School } from "lucide-react";

interface PracticeTabProps {
  topics: Topic[];
  videoTitle?: string;
  selectedLanguage?: string | null;
  onSegmentClick?: (topic: Topic) => void;
  videoId?: string;
  isAuthenticated?: boolean;
  onRequestSignIn?: () => void;
  flashcardRefreshTrigger?: number;
  transcript?: TranscriptSegment[];
  currentTime?: number;
  onSeekTo?: (seconds: number) => void;
  onStartFlashcardSession?: (queue: Flashcard[]) => void;
  flashcardSessionActive?: boolean;
  flashcardSessionProgress?: { currentIndex: number; total: number } | null;
  onExitFlashcardSession?: () => void;
}

const modeLabels: Record<PracticeMode, string> = {
  quiz: "Quiz",
  roleplay: "Roleplay",
  writing: "Writing",
  flashcards: "Flashcards",
};

export function PracticeTab({ topics, videoTitle, selectedLanguage, onSegmentClick, videoId, isAuthenticated, onRequestSignIn, flashcardRefreshTrigger, transcript, currentTime, onSeekTo, onStartFlashcardSession, flashcardSessionActive, flashcardSessionProgress, onExitFlashcardSession }: PracticeTabProps) {
  const [activeMode, setActiveMode] = useState<PracticeMode>("quiz");

  return (
    <div className="flex flex-col h-full">
      {/* Mode Switch */}
      <div className="flex gap-2 p-1 bg-muted rounded-lg mx-4 mt-4">
        {(Object.keys(modeLabels) as PracticeMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setActiveMode(mode)}
            className={cn(
              "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
              activeMode === mode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {modeLabels[mode]}
          </button>
        ))}
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeMode === "quiz" && (
          <QuizPanel topics={topics} videoTitle={videoTitle} />
        )}
        {activeMode === "roleplay" && (
          <RoleplayPanel topics={topics} videoTitle={videoTitle} selectedLanguage={selectedLanguage} />
        )}
        {activeMode === "writing" && (
          <WritingPanel topics={topics} videoTitle={videoTitle} />
        )}
        {activeMode === "flashcards" && videoId && (
          <div className="h-full -m-4">
            <FlashcardsPanel
              youtubeId={videoId}
              isAuthenticated={isAuthenticated}
              onRequestSignIn={onRequestSignIn}
              refreshTrigger={flashcardRefreshTrigger}
              transcript={transcript}
              currentTime={currentTime}
              onSeekTo={onSeekTo}
              onStartSession={onStartFlashcardSession}
              sessionActive={flashcardSessionActive}
              sessionProgress={flashcardSessionProgress}
              onExitSession={onExitFlashcardSession}
            />
          </div>
        )}
      </div>
    </div>
  );
}
