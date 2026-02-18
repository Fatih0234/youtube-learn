export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
  translatedText?: string; // Optional translated text for the segment
}

export interface Topic {
  id: string;
  title: string;
  translatedTitle?: string; // Optional translated title
  description?: string;
  translatedDescription?: string; // Optional translated description
  duration: number;
  segments: {
    start: number;
    end: number;
    text: string;
    translatedText?: string; // Optional translated text for the segment
    startSegmentIdx?: number;
    endSegmentIdx?: number;
    // Character offsets within the start/end segments for precise highlighting
    startCharOffset?: number;
    endCharOffset?: number;
    // Whether the text includes complete sentences
    hasCompleteSentences?: boolean;
    // Confidence score for fuzzy matching (0-1 range)
    confidence?: number;
  }[];
  keywords?: string[]; // Optional for backward compatibility
  translatedKeywords?: string[]; // Optional translated keywords
  quote?: {
    timestamp: string;
    text: string;
    translatedText?: string; // Optional translated quote
  };
  isCitationReel?: boolean; // Flag to identify citation playback reels
  autoPlay?: boolean; // Flag to indicate auto-play when topic is selected
}

export interface TopicCandidate {
  key: string;
  title: string;
  translatedTitle?: string; // Optional translated title
  quote: {
    timestamp: string;
    text: string;
    translatedText?: string; // Optional translated quote
  };
}

export type TopicGenerationMode = 'smart' | 'fast';

export interface VideoData {
  videoId: string;
  title: string;
  transcript: TranscriptSegment[];
  topics: Topic[];
}

export interface Citation {
  number: number;
  text: string;
  start: number;
  end: number;
  startSegmentIdx: number;
  endSegmentIdx: number;
  startCharOffset: number;
  endCharOffset: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp: Date;
  imageUrl?: string;
  imageMetadata?: {
    modelUsed?: string;
    aspectRatio?: string;
    imageSize?: string;
    style?: string;
  };
}

export type NoteSource = 'chat' | 'takeaways' | 'transcript' | 'custom';

export interface NoteMetadata {
  transcript?: {
    start: number;
    end?: number;
    segmentIndex?: number;
    topicId?: string;
  };
  chat?: {
    messageId: string;
    role: 'user' | 'assistant';
    timestamp?: string;
  };
  selectedText?: string;
  selectionContext?: string;
  timestampLabel?: string;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Note {
  id: string;
  userId: string;
  videoId: string;
  source: NoteSource;
  sourceId?: string | null;
  text: string;
  metadata?: NoteMetadata | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteWithVideo extends Note {
  video: {
    youtubeId: string;
    title: string;
    author: string;
    thumbnailUrl: string;
    duration: number;
    slug?: string | null;
  } | null;
}

export interface VideoInfo {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  duration: number | null;
  description?: string;
  tags?: string[];
  language?: string;
  availableLanguages?: string[];
}

// Playback command types for centralized control
export type PlaybackCommandType = 'SEEK' | 'PLAY_TOPIC' | 'PLAY_SEGMENT' | 'PLAY' | 'PAUSE' | 'PLAY_ALL' | 'PLAY_CITATIONS';

export interface PlaybackCommand {
  type: PlaybackCommandType;
  time?: number;
  topic?: Topic;
  segment?: TranscriptSegment;
  citations?: Citation[];
  autoPlay?: boolean;
}

// Translation state for client-side management
export interface TranslationState {
  enabled: boolean;
  targetLanguage: string;
  cache: Map<string, string>; // Cache for translated text
}

// Translation scenario types
export type TranslationScenario = 'transcript' | 'chat' | 'topic' | 'general';

// Translation request handler function signature
export type TranslationRequestHandler = (
  text: string,
  cacheKey: string,
  scenario?: TranslationScenario,
  targetLanguage?: string
) => Promise<string>;

// Flashcard types
export interface Flashcard {
  id: string;
  userId: string;
  videoId: string;
  youtubeId: string;
  selectedText: string;
  tStart: number;
  dueAt: string;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlashcardStats {
  total: number;
  newToday: number;
  dueToday: number;
}

export type FlashcardRating = 'again' | 'hard' | 'good' | 'easy';

export interface FlashcardSession {
  queue: Flashcard[];
  currentIndex: number;
  isActive: boolean;
}

// Practice tab types
export type PracticeMode = 'quiz' | 'roleplay' | 'writing' | 'flashcards';

export type QuizQuestionType = 'multiple-choice' | 'true-false';

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  question: string;
  options?: string[]; // For multiple choice
  correctAnswer: string;
  explanation: string;
  timestamp?: number; // Video timestamp for hints
}

export interface QuizAnswer {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
}

export interface PracticeQuizSettings {
  numberOfQuestions: number;
  difficulty: 'easy' | 'medium' | 'hard';
  showTranscriptHints: boolean;
}

export interface PracticeRoleplaySettings {
  scenario: string;
  characterName: string;
  characterDescription: string;
  characterAvatar?: string;
  goals: { id: string; text: string; completed: boolean }[];
  grammarTarget: string;
  vocabSet: string;
}

export type RoleplayVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'sage' | 'amber' | 'ash' | 'coral' | 'jade';

export interface RoleplayScenario {
  title: string;
  pitch: string;
  instructions: string;
}

export interface RoleplayGoal {
  id: string;
  text: string;
  completed: boolean;
}

export interface RoleplayCharacter {
  name: string;
  description: string;
  avatar?: string;
  voice: RoleplayVoice;
  background: string;
}

export interface RoleplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  audioUrl?: string;
  timestamp: number;
}

export interface RoleplayGoalEvaluation {
  id: string;
  completed: boolean;
  strengths: string[];
  improvements: string[];
  tips: string[];
}

export interface RoleplayEvaluation {
  overallSummary: string;
  goals: RoleplayGoalEvaluation[];
}

export interface RoleplaySetup {
  scenario: RoleplayScenario;
  character: RoleplayCharacter;
  goals: RoleplayGoal[];
  openingInstruction: string;
}

export interface RoleplaySession {
  id: string;
  scenario: RoleplayScenario;
  character: RoleplayCharacter;
  messages: RoleplayMessage[];
  goals: RoleplayGoal[];
  startedAt: number;
  endedAt?: number;
}

export interface PracticeWritingSettings {
  prompt: string;
  length: 'short' | 'medium' | 'long';
  tone: 'casual' | 'formal' | 'academic';
  requiredVocabulary: string[];
  minWords: number;
  maxWords: number;
}

// Writing (AI-powered) types
export type WritingTone = 'casual' | 'formal' | 'academic';
export type WritingLength = 'short' | 'medium' | 'long';

export interface WritingPrompt {
  title: string;
  question: string;
  constraints: string[];
}

export interface WritingSetup {
  prompt: WritingPrompt;
  suggestedVocab: string[];
}

export interface WritingFeedback {
  strengths: string[];
  improvements: string[];
  actionableTips: string[];
  suggestedRewrite: string;
  vocabUsed: string[];
  vocabMissed: string[];
}
