"use client";

import { useMemo, useState } from "react";
import type { Topic, RoleplaySetup, RoleplayVoice, RoleplayCharacter, RoleplayScenario, RoleplayGoal } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RoleplaySession } from "./roleplay-session";
import { CheckCircle2, Circle, Loader2, Play, RefreshCw, Sparkles } from "lucide-react";

interface RoleplayPanelProps {
  topics: Topic[];
  videoTitle?: string;
  selectedLanguage?: string | null;
}

const FALLBACK_AVATAR =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAIB9GL_LB-INw5P4RKQYQIr_jm9bVwdjd2s3XJ5HyjUpnfIYzqxM5CUch5Hl347TIsDbDIz1sLILrPu9BJ8cLeh8NLn_8-2TsykDJkSSS8SVO1NE_V43dhn05kefX7XkoMUk9R4g_HPpcs3O_KP-k5pXTqCXOxn3pwby_EKe7lByD4uIlEbMkmrzWHbDhv60ZNPq_v3B6N3hQUlWI8IlsWmLc_egMXlN_lBbsoUeJ5lNRov8yNhQkT1qxojwUov-BscfnGThBrTlv3";

function buildExcerpt(topic: Topic, maxChars: number) {
  const parts: string[] = [];
  for (const seg of topic.segments || []) {
    if (!seg?.text) continue;
    parts.push(seg.text.replace(/\s+/g, " ").trim());
    const joined = parts.join(" ");
    if (joined.length >= maxChars) {
      return joined.slice(0, maxChars);
    }
  }
  return parts.join(" ").slice(0, maxChars);
}

export function RoleplayPanel({ topics, videoTitle, selectedLanguage }: RoleplayPanelProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    topics?.[0]?.id ?? null
  );
  const [setup, setSetup] = useState<RoleplaySetup | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRoleplaySession, setShowRoleplaySession] = useState(false);

  const selectedTopic = useMemo(
    () => topics.find((t) => t.id === selectedTopicId) || null,
    [topics, selectedTopicId]
  );

  const topicExcerpt = useMemo(() => {
    if (!selectedTopic) return "";
    // Keep prompts stable and cheap.
    return buildExcerpt(selectedTopic, 3500);
  }, [selectedTopic]);

  const previewLines = useMemo(() => {
    if (!topicExcerpt) return [];
    const normalized = topicExcerpt.replace(/\s+/g, " ").trim();
    // Split into pseudo-lines for preview without needing line-clamp plugin.
    const chunk = 420;
    const lines = [normalized.slice(0, chunk), normalized.slice(chunk, chunk * 2), normalized.slice(chunk * 2, chunk * 3)]
      .map((x) => x.trim())
      .filter(Boolean);
    return lines.slice(0, 3);
  }, [topicExcerpt]);

  const canGenerate = !!selectedTopic && topicExcerpt.length >= 20 && !isGenerating;

  const generate = async () => {
    if (!selectedTopic) return;
    setIsGenerating(true);
    setError(null);
    setSetup(null);
    try {
      const resp = await fetch("/api/roleplay/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoTitle,
          topic: {
            id: selectedTopic.id,
            title: selectedTopic.title,
            description: selectedTopic.description,
            excerpt: topicExcerpt,
          },
          style: "real_world_conversation",
          goalsCount: 4,
          language: selectedLanguage || undefined,
        }),
      });

      if (!resp.ok) {
        const payload = await resp.json().catch(() => null);
        throw new Error(payload?.error || "Failed to generate roleplay");
      }

      const data = await resp.json();
      setSetup(data as RoleplaySetup);
    } catch (e) {
      console.error("Roleplay setup error:", e);
      setError(e instanceof Error ? e.message : "Failed to generate roleplay");
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerate = async () => {
    if (!selectedTopic) return;
    setIsGenerating(true);
    setError(null);
    try {
      const resp = await fetch("/api/roleplay/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoTitle,
          topic: {
            id: selectedTopic.id,
            title: selectedTopic.title,
            description: selectedTopic.description,
            excerpt: topicExcerpt,
          },
          style: "real_world_conversation",
          goalsCount: 4,
          language: selectedLanguage || undefined,
        }),
      });

      if (!resp.ok) {
        const payload = await resp.json().catch(() => null);
        throw new Error(payload?.error || "Failed to regenerate roleplay");
      }

      const data = await resp.json();
      setSetup(data as RoleplaySetup);
    } catch (e) {
      console.error("Roleplay setup error:", e);
      setError(e instanceof Error ? e.message : "Failed to regenerate roleplay");
    } finally {
      setIsGenerating(false);
    }
  };

  const startRoleplay = () => {
    if (!setup) return;
    setShowRoleplaySession(true);
  };

  const closeSession = () => setShowRoleplaySession(false);

  if (showRoleplaySession && setup) {
    const character: RoleplayCharacter = {
      ...setup.character,
      avatar: FALLBACK_AVATAR,
    };

    return (
      <RoleplaySession
        scenario={setup.scenario}
        character={character}
        goals={setup.goals}
        openingInstruction={setup.openingInstruction}
        language={selectedLanguage}
        onClose={closeSession}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Roleplay</h2>
          <p className="text-sm text-muted-foreground">
            Build a 5-minute voice call from a topic in this video.
          </p>
        </div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
          Topic-driven
        </div>
      </div>

      <Card className="rounded-2xl p-4">
        <Label className="text-[10px] font-medium text-muted-foreground uppercase">
          Focus topic
        </Label>
        <Select
          value={selectedTopicId ?? ""}
          onValueChange={(v) => {
            setSelectedTopicId(v);
            setSetup(null);
            setError(null);
          }}
          disabled={!topics.length}
        >
          <SelectTrigger className="mt-2">
            <SelectValue placeholder={topics.length ? "Select a topic" : "No topics available"} />
          </SelectTrigger>
          <SelectContent>
            {topics.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedTopic && (
          <div className="mt-4 rounded-2xl border bg-muted/40 p-4">
            <div className="text-xs font-semibold">{selectedTopic.title}</div>
            {selectedTopic.description && (
              <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {selectedTopic.description}
              </div>
            )}

            <div className="mt-3 text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
              Excerpt preview
            </div>
            <div className="mt-2 space-y-1">
              {previewLines.length ? (
                previewLines.map((line, idx) => (
                  <p key={idx} className="text-xs text-muted-foreground leading-relaxed">
                    {line}
                    {idx === previewLines.length - 1 && topicExcerpt.length > (idx + 1) * 420 ? "…" : ""}
                  </p>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  This topic has no excerpt text available.
                </p>
              )}
            </div>

            {!!selectedTopic.keywords?.length && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedTopic.keywords.slice(0, 8).map((k) => (
                  <span
                    key={k}
                    className="text-[10px] px-2 py-1 rounded-full border bg-background text-muted-foreground"
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <Button
            onClick={() => void generate()}
            disabled={!canGenerate}
            className="flex-1 rounded-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate roleplay
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => void regenerate()}
            disabled={!selectedTopic || isGenerating}
            className="rounded-full"
            title="Regenerate with the same topic"
          >
            <RefreshCw className={cn("h-4 w-4", isGenerating && "animate-spin")} />
          </Button>
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </Card>

      {setup && (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-indigo-50/70 dark:bg-indigo-900/20 p-4">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Scenario pitch
            </div>
            <div className="mt-2 text-sm font-bold">{setup.scenario.title}</div>
            <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {setup.scenario.pitch}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-primary">
                Expand instructions
              </summary>
              <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {setup.scenario.instructions}
              </div>
            </details>
          </div>

          <Card className="rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <img
                src={FALLBACK_AVATAR}
                alt={setup.character.name}
                className="w-10 h-10 rounded-full object-cover border border-border"
              />
              <div>
                <div className="font-bold text-sm">{setup.character.name}</div>
                <div className="text-xs text-muted-foreground">{setup.character.description}</div>
              </div>
              <div className="ml-auto text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                Voice: {setup.character.voice}
              </div>
            </div>
            <div className="mt-3 text-sm text-muted-foreground leading-relaxed">
              {setup.character.background}
            </div>
          </Card>

          <Card className="rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                Goals
              </div>
              <div className="text-xs text-muted-foreground">
                {setup.goals.filter((g) => g.completed).length}/{setup.goals.length}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {setup.goals.map((g) => (
                <div
                  key={g.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border",
                    g.completed ? "bg-green-50 border-green-200" : "bg-background border-border"
                  )}
                >
                  <div className={cn("mt-0.5", g.completed ? "text-green-600" : "text-muted-foreground")}>
                    {g.completed ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </div>
                  <div className="text-sm leading-relaxed">{g.text}</div>
                </div>
              ))}
            </div>
          </Card>

          <Button
            onClick={startRoleplay}
            className="w-full rounded-full shadow-lg shadow-primary/20"
          >
            <Play className="h-4 w-4 mr-2" />
            Start 5-minute roleplay
          </Button>
        </div>
      )}

      {!topics.length && (
        <Card className="rounded-2xl p-4">
          <div className="text-sm text-muted-foreground">
            No topics yet. Generate topics for this video first, then come back to Roleplay.
          </div>
        </Card>
      )}
    </div>
  );
}

