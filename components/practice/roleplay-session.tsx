"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  RoleplayCharacter,
  RoleplayEvaluation,
  RoleplayGoal,
  RoleplayMessage,
  RoleplayScenario,
} from "@/lib/types";
import {
  CheckCircle2,
  Circle,
  Loader2,
  MessageSquare,
  Mic,
  Pause,
  PhoneOff,
  Play,
  RefreshCw,
  Volume2,
} from "lucide-react";

type Phase = "lobby" | "call" | "evaluating" | "report";

interface RoleplaySessionProps {
  scenario: RoleplayScenario;
  character: RoleplayCharacter;
  goals: RoleplayGoal[];
  openingInstruction: string;
  language?: string | null;
  onClose: () => void;
}

const SESSION_DURATION_MS = 5 * 60 * 1000;

function formatTime(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RoleplaySession({
  scenario,
  character,
  goals: initialGoals,
  openingInstruction,
  language,
  onClose,
}: RoleplaySessionProps) {
  const [phase, setPhase] = useState<Phase>("lobby");
  const [messages, setMessages] = useState<RoleplayMessage[]>([]);
  const [goals, setGoals] = useState<RoleplayGoal[]>(initialGoals);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(SESSION_DURATION_MS);

  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSttLoading, setIsSttLoading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [typedText, setTypedText] = useState("");

  const [evaluation, setEvaluation] = useState<RoleplayEvaluation | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const createdBlobUrlsRef = useRef<Set<string>>(new Set());

  const endCalledRef = useRef(false);
  const isEndingRef = useRef(false);

  const messagesRef = useRef<RoleplayMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const goalsRef = useRef<RoleplayGoal[]>(goals);
  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);

  const initialGoalsRef = useRef<RoleplayGoal[]>(initialGoals);
  useEffect(() => {
    initialGoalsRef.current = initialGoals;
  }, [initialGoals]);

  // Cleanup audio + blob URLs
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      for (const url of createdBlobUrlsRef.current) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      createdBlobUrlsRef.current.clear();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  const completedCount = goals.filter((g) => g.completed).length;

  const pauseAudio = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setIsSpeaking(false);
  }, []);

  const dataAudioToBlobUrl = useCallback((dataUrl: string) => {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Unexpected audio format");

    const mime = match[1];
    const base64 = match[2];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const blob = new Blob([bytes], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    createdBlobUrlsRef.current.add(blobUrl);
    return blobUrl;
  }, []);

  const attachAudioToMessage = useCallback((messageId: string, blobUrl: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        if (m.audioUrl?.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(m.audioUrl);
          } catch {
            // ignore
          }
          createdBlobUrlsRef.current.delete(m.audioUrl);
        }
        return { ...m, audioUrl: blobUrl };
      })
    );
  }, []);

  const playBlobAudio = useCallback(async (blobUrl: string, onStart?: () => void) => {
    pauseAudio();
    const audio = new Audio(blobUrl);
    audioRef.current = audio;
    audio.onplay = () => {
      setIsSpeaking(true);
      onStart?.();
    };
    audio.onended = () => setIsSpeaking(false);
    audio.onerror = () => setIsSpeaking(false);

    try {
      await audio.play();
    } catch {
      // Autoplay may be blocked; user can replay manually.
      setIsSpeaking(false);
    }
  }, [pauseAudio]);

  const playTextToSpeech = useCallback(
    async (text: string, messageId: string) => {
      setIsTtsLoading(true);
      try {
        const response = await fetch("/api/roleplay/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voice: character.voice,
            model: "tts-1",
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Failed to generate speech");
        }

        const data = await response.json();
        const blobUrl = dataAudioToBlobUrl(data.audio);
        attachAudioToMessage(messageId, blobUrl);
        await playBlobAudio(blobUrl);
      } finally {
        setIsTtsLoading(false);
      }
    },
    [attachAudioToMessage, character.voice, dataAudioToBlobUrl, playBlobAudio]
  );

  const appendMessage = useCallback((role: "user" | "assistant", content: string) => {
    const msg: RoleplayMessage = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      role,
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const updateGoalsHeuristic = useCallback((prevGoals: RoleplayGoal[], userText: string) => {
    const lower = userText.toLowerCase();
    return prevGoals.map((g) => {
      if (g.completed) return g;
      const key = g.text.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
      return lower.includes(key) ? { ...g, completed: true } : g;
    });
  }, []);

  const requestAssistant = useCallback(
    async (userMessage: string, history?: RoleplayMessage[], goalsOverride?: RoleplayGoal[]) => {
      setIsChatLoading(true);
      try {
        const payload = {
          scenario,
          character: {
            name: character.name,
            description: character.description,
            voice: character.voice,
            background: character.background,
          },
          messages: (history || messagesRef.current).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          userMessage,
          goals: goalsOverride || goalsRef.current,
          language: language || undefined,
        };

        const resp = await fetch("/api/roleplay/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) throw new Error("Failed to get response");
        const data = await resp.json();
        return String(data.response || "");
      } finally {
        setIsChatLoading(false);
      }
    },
    [character.background, character.description, character.name, character.voice, goals, language, scenario]
  );

  const handleSendText = useCallback(
    async (text: string) => {
      setError(null);
      const userMsg = appendMessage("user", text);
      messagesRef.current = [...messagesRef.current, userMsg];

      const nextGoals = updateGoalsHeuristic(goalsRef.current, text);
      goalsRef.current = nextGoals;
      setGoals(nextGoals);

      const aiText = await requestAssistant(text, messagesRef.current, nextGoals);
      if (!aiText) return;

      const aiMsg = appendMessage("assistant", aiText);
      await playTextToSpeech(aiText, aiMsg.id);

      // Keep refs in sync for subsequent calls
      messagesRef.current = [...messagesRef.current, aiMsg];
    },
    [appendMessage, playTextToSpeech, requestAssistant, updateGoalsHeuristic]
  );

  const handleUserAudio = useCallback(
    async (audioBlob: Blob) => {
      setIsSttLoading(true);
      try {
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");
        const resp = await fetch("/api/roleplay/stt", {
          method: "POST",
          body: formData,
        });

        if (!resp.ok) throw new Error("Failed to transcribe");
        const data = await resp.json();
        const text = String(data.text || "").trim();
        if (!text) throw new Error("No speech detected");

        await handleSendText(text);
      } catch (e) {
        console.error("STT error:", e);
        setError("Could not transcribe audio. You can open Chat and type instead.");
      } finally {
        setIsSttLoading(false);
      }
    },
    [handleSendText]
  );

  const startRecording = useCallback(async () => {
    setError(null);
    pauseAudio();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      audioChunksRef.current = [];

      if (isEndingRef.current) return;
      await handleUserAudio(audioBlob);
    };

    mediaRecorder.start(100);
    setIsRecording(true);
  }, [handleUserAudio, pauseAudio]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state === "inactive") return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  }, []);

  const startCall = useCallback(async () => {
    endCalledRef.current = false;
    isEndingRef.current = false;
    setEvaluation(null);
    setSelectedGoalId(null);
    setError(null);

    setMessages([]);
    messagesRef.current = [];
    const freshGoals = initialGoalsRef.current.map((g) => ({ ...g, completed: false }));
    goalsRef.current = freshGoals;
    setGoals(freshGoals);

    setPhase("call");
    setStartedAtMs(Date.now());
    setRemainingMs(SESSION_DURATION_MS);

    try {
      const opener = await requestAssistant(openingInstruction, [], freshGoals);
      const aiMsg = appendMessage("assistant", opener);
      messagesRef.current = [aiMsg];
      await playTextToSpeech(opener, aiMsg.id);
    } catch (e) {
      console.error("Opener error:", e);
      setError("Could not start the roleplay. Please try again.");
    }
  }, [appendMessage, openingInstruction, playTextToSpeech, requestAssistant]);

  const endSession = useCallback(
    async (_reason: "timeout" | "manual") => {
      if (endCalledRef.current) return;
      endCalledRef.current = true;
      isEndingRef.current = true;

      pauseAudio();
      if (isRecording) stopRecording();

      setPhase("evaluating");
      setError(null);

      try {
        const resp = await fetch("/api/roleplay/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario,
            character: {
              name: character.name,
              description: character.description,
              background: character.background,
            },
            goals: goalsRef.current.map((g) => ({ id: g.id, text: g.text })),
            messages: messagesRef.current.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            language: language || undefined,
          }),
        });

        if (!resp.ok) throw new Error("Failed to evaluate");
        const data = (await resp.json()) as RoleplayEvaluation;
        setEvaluation(data);

        // Sync goal completion with evaluator output
        setGoals((prev) =>
          prev.map((g) => {
            const found = data.goals?.find((x) => x.id === g.id);
            return found ? { ...g, completed: !!found.completed } : g;
          })
        );

        setPhase("report");
      } catch (e) {
        console.error("Evaluation error:", e);
        setError("Could not generate your report. Please try again.");
        setPhase("report");
      } finally {
        isEndingRef.current = false;
      }
    },
    [character.background, character.description, character.name, goals, isRecording, pauseAudio, scenario, stopRecording]
  );

  // Timer tick (avoid drift by referencing startedAtMs)
  useEffect(() => {
    if (phase !== "call" || !startedAtMs) return;

    const id = window.setInterval(() => {
      const elapsed = Date.now() - startedAtMs;
      const next = Math.max(0, SESSION_DURATION_MS - elapsed);
      setRemainingMs(next);
      if (next <= 0) {
        void endSession("timeout");
      }
    }, 250);

    return () => window.clearInterval(id);
  }, [endSession, phase, startedAtMs]);

  const canTalk =
    phase === "call" &&
    !isSttLoading &&
    !isChatLoading &&
    !isTtsLoading;

  const micHint = useMemo(() => {
    if (phase !== "call") return "";
    if (isSttLoading) return "Transcribing…";
    if (isChatLoading) return "Thinking…";
    if (isTtsLoading || isSpeaking) return "Speaking… (tap mic to interrupt)";
    if (isRecording) return "Listening… tap again to send";
    return "Tap to talk";
  }, [isChatLoading, isRecording, isSpeaking, isSttLoading, isTtsLoading, phase]);

  const micButtonLabel = isRecording ? "Stop + Send" : "Talk";

  const onMicClick = async () => {
    if (phase !== "call") return;
    if (!canTalk && !isRecording && !isSpeaking) return;

    // Allow user to interrupt TTS by starting to talk.
    if ((isSpeaking || isTtsLoading) && !isRecording) {
      pauseAudio();
    }

    if (isRecording) {
      stopRecording();
      return;
    }

    try {
      await startRecording();
    } catch (e) {
      console.error("Error starting recording:", e);
      setError("Could not access microphone. Please allow microphone access and try again.");
    }
  };

  const replayLastAi = async () => {
    if (isSpeaking) {
      pauseAudio();
      return;
    }
    if (!lastAssistantMessage?.audioUrl) return;
    await playBlobAudio(lastAssistantMessage.audioUrl);
  };

  const resetToLobby = () => {
    pauseAudio();
    setPhase("lobby");
    setStartedAtMs(null);
    setRemainingMs(SESSION_DURATION_MS);
    setMessages([]);
    messagesRef.current = [];
    setGoals(initialGoalsRef.current.map((g) => ({ ...g, completed: false })));
    setEvaluation(null);
    setSelectedGoalId(null);
    setError(null);
    setIsTranscriptOpen(false);
    setTypedText("");
  };

  const reportGoal = selectedGoalId
    ? evaluation?.goals?.find((g) => g.id === selectedGoalId) || null
    : null;
  const selectedGoal = selectedGoalId
    ? goals.find((g) => g.id === selectedGoalId) || null
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Atmosphere */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(1200px_800px_at_25%_10%,rgba(14,165,233,0.18),transparent_55%),radial-gradient(900px_700px_at_80%_30%,rgba(34,197,94,0.12),transparent_55%),radial-gradient(900px_700px_at_55%_95%,rgba(244,63,94,0.10),transparent_55%)]" />

      {/* Top bar */}
      <header className="relative z-10 h-16 border-b bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/55">
        <div className="h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={character.avatar}
              alt={character.name}
              className="w-9 h-9 rounded-full object-cover border border-border shadow-sm"
            />
            <div className="leading-tight">
              <div className="text-sm font-bold">
                Roleplay: {scenario.title}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {phase === "call" ? "In progress" : phase === "report" ? "Report" : "Ready"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {phase === "call" && (
              <div className={cn(
                "px-3 py-1.5 rounded-full text-xs font-mono border",
                remainingMs <= 20_000 ? "border-red-300 text-red-700 bg-red-50" : "border-border bg-background"
              )}>
                {formatTime(remainingMs)}
              </div>
            )}

            {phase === "call" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTranscriptOpen(true)}
                className="gap-2 rounded-full"
              >
                <MessageSquare className="h-4 w-4" />
                Chat
              </Button>
            )}

            {phase === "call" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void endSession("manual")}
                className="gap-2 rounded-full"
              >
                <PhoneOff className="h-4 w-4" />
                End role play
              </Button>
            )}

            {(phase === "lobby" || phase === "report") && (
              <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full">
                Close
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 h-[calc(100%-4rem)] flex">
        {/* Left: Stage */}
        <section className="flex-1 overflow-hidden">
          <div className="h-full p-6">
            {phase === "lobby" && (
              <div className="h-full grid place-items-center">
                <Card className="w-full max-w-3xl p-6 rounded-3xl shadow-[0_30px_80px_rgba(0,0,0,0.08)] border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
                  <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
                    <div>
                      <div className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                        Scenario pitch
                      </div>
                      <h2 className="mt-2 text-2xl font-extrabold leading-tight">
                        {scenario.title}
                      </h2>
                      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                        {scenario.pitch}
                      </p>

                      <div className="mt-5 p-4 rounded-2xl border bg-background/70">
                        <div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
                          What to do
                        </div>
                        <p className="mt-2 text-sm leading-relaxed">
                          {scenario.instructions}
                        </p>
                      </div>

                      <div className="mt-6 flex items-center gap-3">
                        <Button
                          onClick={() => void startCall()}
                          className="rounded-full px-5 shadow-lg shadow-primary/25"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Start 5-minute roleplay
                        </Button>
                        <Button
                          variant="outline"
                          onClick={onClose}
                          className="rounded-full"
                        >
                          Not now
                        </Button>
                      </div>

                      {error && (
                        <div className="mt-4 text-sm text-red-600">
                          {error}
                        </div>
                      )}
                    </div>

                    <div className="rounded-3xl border bg-[radial-gradient(700px_500px_at_20%_0%,rgba(59,130,246,0.20),transparent_60%),radial-gradient(600px_450px_at_90%_55%,rgba(16,185,129,0.12),transparent_60%)] p-5">
                      <div className="flex items-center gap-4">
                        <div className="relative shrink-0">
                          <img
                            src={character.avatar}
                            alt={character.name}
                            className="w-14 h-14 rounded-full object-cover border-2 border-background shadow-sm"
                          />
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-background" />
                        </div>
                        <div>
                          <div className="text-sm font-bold">{character.name}</div>
                          <div className="text-xs text-muted-foreground">{character.description}</div>
                        </div>
                      </div>
                      <div className="mt-4 text-sm leading-relaxed text-muted-foreground">
                        {character.background}
                      </div>

                      <div className="mt-5 pt-5 border-t">
                        <div className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                          Goals
                        </div>
                        <div className="mt-3 space-y-2">
                          {goals.map((g) => (
                            <div key={g.id} className="flex items-start gap-2 text-sm">
                              <Circle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                              <span>{g.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {phase === "call" && (
              <div className="h-full grid grid-rows-[1fr_auto] gap-6">
                <div className="relative rounded-[2.25rem] border bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(255,255,255,0.25))] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.75),rgba(2,6,23,0.55))] overflow-hidden">
                  <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(1100px_700px_at_30%_20%,rgba(56,189,248,0.18),transparent_55%),radial-gradient(900px_650px_at_75%_65%,rgba(34,197,94,0.12),transparent_58%)]" />

                  <div className="relative h-full grid place-items-center p-8">
                    <div className="relative">
                      <div className={cn(
                        "absolute -inset-8 rounded-full blur-2xl opacity-70",
                        isSpeaking ? "bg-green-400/25" : isRecording ? "bg-red-400/25" : "bg-sky-400/20"
                      )} />
                      <img
                        src={character.avatar}
                        alt={character.name}
                        className="relative z-10 w-44 h-44 rounded-full object-cover border-4 border-background shadow-2xl"
                      />
                      <div className={cn(
                        "absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold border bg-background/80 backdrop-blur",
                        isSpeaking ? "border-green-300 text-green-700" : isRecording ? "border-red-300 text-red-700" : "border-border text-muted-foreground"
                      )}>
                        {isSpeaking ? "Speaking" : isRecording ? "Listening" : "Ready"}
                      </div>
                    </div>

                    <div className="mt-10 max-w-2xl w-full">
                      <div className="rounded-3xl border bg-background/70 backdrop-blur px-5 py-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                              {character.name}
                            </div>
                            <div className="mt-2 text-sm leading-relaxed">
                              {lastAssistantMessage?.content || (isChatLoading ? "…" : "")}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="icon"
                              className="rounded-full"
                              disabled={!lastAssistantMessage?.audioUrl || isTtsLoading}
                              onClick={() => void replayLastAi()}
                              title="Replay"
                            >
                              {isSpeaking ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {error && (
                        <div className="mt-3 text-sm text-red-600">
                          {error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void onMicClick()}
                      disabled={phase !== "call"}
                      className={cn(
                        "group relative w-20 h-20 rounded-full grid place-items-center border shadow-[0_18px_40px_rgba(0,0,0,0.12)] transition",
                        isRecording
                          ? "bg-red-600 border-red-200 text-white"
                          : "bg-background border-border hover:bg-muted",
                        (!canTalk && !isRecording && !isSpeaking) && "opacity-50 pointer-events-none"
                      )}
                      aria-label={micButtonLabel}
                    >
                      <div className={cn(
                        "absolute inset-0 rounded-full",
                        (isRecording || isSpeaking) && "animate-pulse"
                      )} />
                      <Mic className="relative z-10 h-7 w-7" />
                    </button>
                    <div className="text-xs text-muted-foreground text-center">
                      {micHint}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {phase === "evaluating" && (
              <div className="h-full grid place-items-center">
                <Card className="w-full max-w-lg p-6 rounded-3xl border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <div>
                      <div className="font-bold">Reviewing your call…</div>
                      <div className="text-sm text-muted-foreground">
                        Checking goals, strengths, and next steps.
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {phase === "report" && (
              <div className="h-full overflow-y-auto p-2">
                <div className="max-w-5xl mx-auto space-y-6">
                  <div className="rounded-3xl border bg-[linear-gradient(135deg,rgba(2,132,199,0.18),rgba(34,197,94,0.10))] p-6">
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                          Session report
                        </div>
                        <div className="mt-2 text-2xl font-extrabold">
                          {completedCount === goals.length ? "Nice work." : "Keep pushing forward."}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                          {evaluation?.overallSummary || "Here’s what I noticed from your roleplay and how to improve next time."}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col gap-2">
                        <Button onClick={resetToLobby} className="rounded-full gap-2">
                          <RefreshCw className="h-4 w-4" />
                          Retry role play
                        </Button>
                        <Button variant="outline" onClick={onClose} className="rounded-full">
                          Continue
                        </Button>
                      </div>
                    </div>
                  </div>

                  {!selectedGoalId && (
                    <div className="grid md:grid-cols-2 gap-4">
                      {goals.map((g) => {
                        const evalGoal = evaluation?.goals?.find((x) => x.id === g.id);
                        return (
                          <Card key={g.id} className="rounded-3xl p-5">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "w-9 h-9 rounded-full grid place-items-center border",
                                  g.completed ? "bg-green-50 border-green-200 text-green-700" : "bg-muted border-border text-muted-foreground"
                                )}>
                                  {g.completed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                                </div>
                                <div>
                                  <div className="font-bold">Goal {g.id}</div>
                                  <div className="text-sm text-muted-foreground leading-relaxed">
                                    {g.text}
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full"
                                onClick={() => setSelectedGoalId(g.id)}
                                disabled={!evalGoal}
                              >
                                Show details
                              </Button>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {selectedGoalId && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                            Goal {selectedGoalId}
                          </div>
                          <div className="text-lg font-extrabold">
                            {selectedGoal?.text}
                          </div>
                        </div>
                        <Button variant="outline" className="rounded-full" onClick={() => setSelectedGoalId(null)}>
                          Back
                        </Button>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <Card className="rounded-3xl p-5">
                          <div className="font-bold mb-2">Strengths</div>
                          <ul className="text-sm text-muted-foreground space-y-2">
                            {(reportGoal?.strengths?.length ? reportGoal.strengths : ["No clear strengths were detected for this goal."])
                              .map((t, idx) => (
                                <li key={idx} className="leading-relaxed">
                                  {t}
                                </li>
                              ))}
                          </ul>
                        </Card>

                        <Card className="rounded-3xl p-5">
                          <div className="font-bold mb-2">Areas for improvement</div>
                          <ul className="text-sm text-muted-foreground space-y-2">
                            {(reportGoal?.improvements?.length ? reportGoal.improvements : ["No clear improvements were detected for this goal."])
                              .map((t, idx) => (
                                <li key={idx} className="leading-relaxed">
                                  {t}
                                </li>
                              ))}
                          </ul>
                        </Card>
                      </div>

                      <Card className="rounded-3xl p-5 bg-[linear-gradient(135deg,rgba(56,189,248,0.10),rgba(34,197,94,0.06))]">
                        <div className="font-bold mb-2">Actionable tips</div>
                        <ul className="text-sm text-muted-foreground space-y-2">
                          {(reportGoal?.tips?.length ? reportGoal.tips : ["Try again and address this goal explicitly in your next attempt."])
                            .map((t, idx) => (
                              <li key={idx} className="leading-relaxed">
                                {t}
                              </li>
                            ))}
                        </ul>
                      </Card>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right: Guide */}
        <aside className="w-[360px] border-l bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/55 hidden lg:flex flex-col">
          <div className="p-5 border-b">
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
              Roleplay guide
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <div className="font-semibold">Your goals</div>
              <div className="text-muted-foreground">
                {completedCount}/{goals.length}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="space-y-2">
              {goals.map((g) => (
                <div
                  key={g.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-2xl border",
                    g.completed
                      ? "bg-green-50/70 border-green-200"
                      : "bg-background/60 border-border"
                  )}
                >
                  <div className={cn(
                    "mt-0.5",
                    g.completed ? "text-green-600" : "text-muted-foreground"
                  )}>
                    {g.completed ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  </div>
                  <div className="text-sm leading-relaxed">
                    {g.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border bg-[linear-gradient(135deg,rgba(2,132,199,0.08),rgba(34,197,94,0.04))] p-4">
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                Scenario
              </div>
              <div className="mt-2 font-bold">{scenario.title}</div>
              <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {scenario.pitch}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-primary">
                  Expand instructions
                </summary>
                <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {scenario.instructions}
                </div>
              </details>
            </div>

            <div className="rounded-3xl border bg-background/60 p-4">
              <div className="flex items-center gap-3">
                <img
                  src={character.avatar}
                  alt={character.name}
                  className="w-10 h-10 rounded-full object-cover border border-border"
                />
                <div>
                  <div className="font-bold text-sm">{character.name}</div>
                  <div className="text-xs text-muted-foreground">{character.description}</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {character.background}
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Transcript dialog */}
      <Dialog open={isTranscriptOpen} onOpenChange={setIsTranscriptOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Chat transcript</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col h-[60vh]">
            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              {messages.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No transcript yet.
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-2xl border px-4 py-3",
                      m.role === "user" ? "bg-muted/60" : "bg-background"
                    )}
                  >
                    <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                      {m.role === "user" ? "You" : character.name}
                    </div>
                    <div className="mt-1 text-sm leading-relaxed">{m.content}</div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t mt-3 flex gap-2">
              <input
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="Type instead…"
                className="flex-1 bg-muted border border-border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={phase !== "call" || isChatLoading || isTtsLoading || isSttLoading}
              />
              <Button
                onClick={() => {
                  const text = typedText.trim();
                  if (!text) return;
                  setTypedText("");
                  void handleSendText(text);
                }}
                disabled={!typedText.trim() || phase !== "call" || isChatLoading || isTtsLoading || isSttLoading}
                className="rounded-full"
              >
                Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
