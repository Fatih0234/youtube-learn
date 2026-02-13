"use client";

import { useMemo, useState } from "react";
import type { Topic, WritingFeedback, WritingSetup, WritingTone, WritingLength } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Edit3, Send, Lightbulb, History, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface WritingPanelProps {
  topics: Topic[];
  videoTitle?: string;
}

const lengthOptions = [
  { value: "short", label: "Short (50 words)", words: 50 },
  { value: "medium", label: "Medium (100 words)", words: 100 },
  { value: "long", label: "Long (200 words)", words: 200 },
];

const toneOptions = [
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "academic", label: "Academic" },
];

function buildExcerpt(topic: Topic, maxChars: number) {
  const parts: string[] = [];
  for (const seg of topic.segments || []) {
    if (!seg?.text) continue;
    parts.push(seg.text.replace(/\s+/g, " ").trim());
    const joined = parts.join(" ");
    if (joined.length >= maxChars) return joined.slice(0, maxChars);
  }
  return parts.join(" ").slice(0, maxChars);
}

export function WritingPanel({ topics, videoTitle }: WritingPanelProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    topics?.[0]?.id ?? null
  );
  const [setup, setSetup] = useState<WritingSetup | null>(null);
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);

  const [length, setLength] = useState<WritingLength>("medium");
  const [tone, setTone] = useState<WritingTone>("formal");
  const [userText, setUserText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTopic = useMemo(
    () => topics.find((t) => t.id === selectedTopicId) || null,
    [topics, selectedTopicId]
  );

  const excerpt = useMemo(() => {
    if (!selectedTopic) return "";
    return buildExcerpt(selectedTopic, 3500);
  }, [selectedTopic]);

  const currentLength = useMemo(() => {
    return lengthOptions.find((l) => l.value === length)?.words || 100;
  }, [length]);

  const wordCount = useMemo(() => {
    if (!userText.trim()) return 0;
    return userText.trim().split(/\s+/).length;
  }, [userText]);

  const previewLines = useMemo(() => {
    if (!excerpt) return [];
    const normalized = excerpt.replace(/\s+/g, " ").trim();
    const chunk = 420;
    const lines = [
      normalized.slice(0, chunk),
      normalized.slice(chunk, chunk * 2),
      normalized.slice(chunk * 2, chunk * 3),
    ]
      .map((x) => x.trim())
      .filter(Boolean);
    return lines.slice(0, 3);
  }, [excerpt]);

  const canGenerate = !!selectedTopic && excerpt.length >= 20 && !isGenerating;

  const generateQuestion = async () => {
    if (!selectedTopic) return;
    setIsGenerating(true);
    setError(null);
    setSetup(null);
    setFeedback(null);
    try {
      const resp = await fetch("/api/writing/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoTitle,
          topic: {
            id: selectedTopic.id,
            title: selectedTopic.title,
            description: selectedTopic.description,
            excerpt,
          },
          tone,
          length,
          targetWordCount: currentLength,
          vocabCount: 6,
        }),
      });

      if (!resp.ok) {
        const payload = await resp.json().catch(() => null);
        throw new Error(payload?.error || "Failed to generate question");
      }

      const data = (await resp.json()) as WritingSetup;
      setSetup(data);
    } catch (e) {
      console.error("Writing setup error:", e);
      setError(e instanceof Error ? e.message : "Failed to generate question");
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerate = async () => {
    if (!selectedTopic) return;
    setIsGenerating(true);
    setError(null);
    setFeedback(null);
    try {
      const resp = await fetch("/api/writing/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoTitle,
          topic: {
            id: selectedTopic.id,
            title: selectedTopic.title,
            description: selectedTopic.description,
            excerpt,
          },
          tone,
          length,
          targetWordCount: currentLength,
          vocabCount: 6,
        }),
      });

      if (!resp.ok) {
        const payload = await resp.json().catch(() => null);
        throw new Error(payload?.error || "Failed to regenerate question");
      }

      const data = (await resp.json()) as WritingSetup;
      setSetup(data);
    } catch (e) {
      console.error("Writing setup error:", e);
      setError(e instanceof Error ? e.message : "Failed to regenerate question");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!setup || !selectedTopic) return;
    if (wordCount < 10) return;

    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const resp = await fetch("/api/writing/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoTitle,
          topic: {
            id: selectedTopic.id,
            title: selectedTopic.title,
            excerpt,
          },
          prompt: {
            title: setup.prompt.title,
            question: setup.prompt.question,
          },
          tone,
          targetWordCount: currentLength,
          suggestedVocab: setup.suggestedVocab,
          userText,
        }),
      });

      if (!resp.ok) {
        const payload = await resp.json().catch(() => null);
        throw new Error(payload?.error || "Failed to get feedback");
      }

      const data = (await resp.json()) as WritingFeedback;
      setFeedback(data);
    } catch (e) {
      console.error("Writing feedback error:", e);
      setError(e instanceof Error ? e.message : "Failed to get feedback");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-foreground">Writing Practice</h2>
        <p className="text-sm text-muted-foreground">Practice writing based on the video content.</p>
      </div>

      {/* Focus Topic */}
      <Card className="rounded-2xl p-4">
        <Label className="text-[10px] font-medium text-muted-foreground uppercase">
          Focus topic
        </Label>
        <Select
          value={selectedTopicId ?? ""}
          onValueChange={(v) => {
            setSelectedTopicId(v);
            setSetup(null);
            setFeedback(null);
            setError(null);
            setUserText("");
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
                    {idx === previewLines.length - 1 && excerpt.length > (idx + 1) * 420 ? "…" : ""}
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

        {error && (
          <div className="mt-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </Card>

      {/* Length and Tone */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="block text-xs font-medium text-muted-foreground mb-1.5">Length</Label>
          <Select
            value={length}
            onValueChange={(v) => {
              setLength(v as WritingLength);
              setSetup(null);
              setFeedback(null);
            }}
          >
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lengthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="block text-xs font-medium text-muted-foreground mb-1.5">Tone</Label>
          <Select
            value={tone}
            onValueChange={(v) => {
              setTone(v as WritingTone);
              setSetup(null);
              setFeedback(null);
            }}
          >
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {toneOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Generate prompt */}
      <div className="flex gap-3">
        <Button
          onClick={() => void generateQuestion()}
          disabled={!canGenerate}
          className="flex-1 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate question
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => void regenerate()}
          disabled={!selectedTopic || isGenerating}
          className="rounded-full"
          title="Regenerate with the same settings"
        >
          <RefreshCw className={cn("h-4 w-4", isGenerating && "animate-spin")} />
        </Button>
      </div>

      {/* Writing Prompt */}
      {setup && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-800 rounded-lg text-indigo-600 dark:text-indigo-300 shrink-0">
              <Edit3 className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-1">
                {setup.prompt.title}
              </h3>
              <p className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed">
                {setup.prompt.question}
              </p>
              {!!setup.prompt.constraints?.length && (
                <ul className="mt-3 space-y-1 text-xs text-indigo-800/80 dark:text-indigo-200/80">
                  {setup.prompt.constraints.map((c, idx) => (
                    <li key={idx}>• {c}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Suggested Vocabulary */}
      {setup && (
        <div>
          <Label className="block text-xs font-medium text-muted-foreground mb-2">
            Suggested vocabulary (optional)
          </Label>
          <div className="flex flex-wrap gap-2">
            {setup.suggestedVocab.map((word) => (
              <Badge
                key={word}
                variant="outline"
                className="px-2.5 py-1 text-xs font-medium bg-muted/50"
              >
                {word}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Textarea */}
      <div className="flex flex-col min-h-[180px]">
        <Label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Your Response
        </Label>
        <div className="relative flex-1">
          <Textarea
            value={userText}
            onChange={(e) => setUserText(e.target.value)}
            placeholder={setup ? "Start typing your response here..." : "Generate a question first…"}
            className="w-full h-full min-h-[140px] resize-none leading-relaxed"
            disabled={!setup || isSubmitting || isGenerating}
          />
          <div className="absolute bottom-3 right-3 text-xs text-muted-foreground font-mono bg-background/80 px-2 py-1 rounded">
            {wordCount} / {currentLength} words
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={!setup || isSubmitting || isGenerating || wordCount < 10}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Getting feedback…
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Submit for Feedback
          </>
        )}
      </Button>

      {setup && wordCount < 10 && wordCount > 0 && (
        <p className="text-xs text-amber-600 text-center">
          Write at least 10 words to submit.
        </p>
      )}

      {/* Feedback Card */}
      {feedback && (
        <div className="space-y-4">
          <Card className="rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="text-sm font-bold">Strengths</div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {feedback.strengths.map((s, idx) => (
                <li key={idx}>• {s}</li>
              ))}
            </ul>
          </Card>

          <Card className="rounded-2xl p-4">
            <div className="text-sm font-bold">Areas to improve</div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {feedback.improvements.map((s, idx) => (
                <li key={idx}>• {s}</li>
              ))}
            </ul>
          </Card>

          <Card className="rounded-2xl p-4 bg-indigo-50/50 dark:bg-indigo-900/15 border-indigo-100 dark:border-indigo-800">
            <div className="text-sm font-bold">Actionable tips</div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {feedback.actionableTips.map((s, idx) => (
                <li key={idx}>• {s}</li>
              ))}
            </ul>
          </Card>

          <Card className="rounded-2xl p-4">
            <div className="text-sm font-bold">Suggested rewrite</div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {feedback.suggestedRewrite}
            </p>
          </Card>

          {setup && (
            <Card className="rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-bold">Vocabulary usage</div>
                <div className="text-xs text-muted-foreground font-mono">
                  {feedback.vocabUsed.length} / {setup.suggestedVocab.length}
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Used
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(feedback.vocabUsed.length ? feedback.vocabUsed : ["none"]).map((w) => (
                  <Badge key={`used_${w}`} variant="outline" className="bg-green-50/60 border-green-200">
                    {w}
                  </Badge>
                ))}
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                Missed
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(feedback.vocabMissed.length ? feedback.vocabMissed : ["none"]).map((w) => (
                  <Badge key={`missed_${w}`} variant="outline" className="bg-muted/40">
                    {w}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* History Link */}
      <div className="flex items-center justify-between pt-2 border-t">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Lightbulb className="h-3 w-3" />
          AI feedback available
        </span>
        <Button variant="link" size="sm" className="text-xs text-primary h-auto p-0">
          <History className="h-3 w-3 mr-1" />
          View History
        </Button>
      </div>
    </div>
  );
}
