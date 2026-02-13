"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PracticeMode, Topic } from "@/lib/types";
import { QuizPanel } from "./quiz-panel";
import { RoleplayPanel } from "./roleplay-panel";
import { WritingPanel } from "./writing-panel";
import { School } from "lucide-react";

interface PracticeTabProps {
  topics: Topic[];
  videoTitle?: string;
  selectedLanguage?: string | null;
  onSegmentClick?: (topic: Topic) => void;
}

const modeLabels: Record<PracticeMode, string> = {
  quiz: "Quiz",
  roleplay: "Roleplay",
  writing: "Writing",
};

export function PracticeTab({ topics, videoTitle, selectedLanguage, onSegmentClick }: PracticeTabProps) {
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
      </div>
    </div>
  );
}
