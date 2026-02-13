import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { generateAIResponse } from '@/lib/ai-client';
import { QuizQuestion } from '@/lib/types';

const quizGenerationSchema = z.object({
  topics: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    segments: z.array(z.object({
      start: z.number(),
      end: z.number(),
      text: z.string(),
    })).optional(),
  })),
  numberOfQuestions: z.number().min(1).max(10),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  language: z.string().optional().default('en'),
});

type QuizGenerationRequest = z.infer<typeof quizGenerationSchema>;

interface QuizQuestionJSON {
  type: 'multiple-choice' | 'true-false';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  timestamp?: number;
}

async function generateQuizQuestions(request: QuizGenerationRequest): Promise<QuizQuestionJSON[]> {
  const { topics, numberOfQuestions, difficulty, language } = request;
  
  // Calculate 80% MC, 20% T/F
  const mcCount = Math.floor(numberOfQuestions * 0.8);
  const tfCount = numberOfQuestions - mcCount;
  
  // Build context from topics
  const topicContext = topics.slice(0, 5).map((topic, idx) => {
    const segmentText = topic.segments?.[0]?.text || '';
    return `Topic ${idx + 1}: ${topic.title}${topic.description ? ` - ${topic.description}` : ''}${segmentText ? `\nExcerpt: ${segmentText.slice(0, 200)}...` : ''}`;
  }).join('\n\n');

  // Difficulty instructions
  const difficultyInstructions = {
    easy: 'Create simple questions that can be answered by listening carefully. Include obvious keywords in the options.',
    medium: 'Create questions that require understanding the main concepts. Options should be plausible.',
    hard: 'Create challenging questions that require deep understanding. Include subtle distinctions between options.',
  };

  const prompt = `You are a language learning assistant. Create ${numberOfQuestions} listening comprehension quiz questions based on the video topics below.

IMPORTANT LANGUAGE: Generate questions in ${language === 'es' ? 'Spanish' : language === 'fr' ? 'French' : language === 'de' ? 'German' : language === 'it' ? 'Italian' : 'English'}.

Requirements:
- ${mcCount} multiple choice questions (80%)
- ${tfCount} true/false questions (20%)
- ${difficultyInstructions[difficulty]}
- Each question should test understanding of the video content
- Include a brief explanation for the correct answer

Video Topics:
${topicContext}

Respond with a JSON array of questions in this exact format:
[
  {
    "type": "multiple-choice",
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Option C",
    "explanation": "Brief explanation of why this is correct",
    "timestamp": 120
  },
  {
    "type": "true-false",
    "question": "True or False: The video explains...",
    "correctAnswer": "True",
    "explanation": "Explanation",
    "timestamp": 180
  }
]

IMPORTANT: 
- Set timestamp to the start time of the relevant segment from the topic (use the first segment's start time, or a reasonable time in seconds)
- For multiple choice, exactly 4 options with one clearly correct
- Make sure the correctAnswer exactly matches one of the options
- Return ONLY valid JSON, no markdown, no explanation`;

  const response = await generateAIResponse(prompt, {
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    temperature: 0.7,
    maxOutputTokens: 4000,
  });

  // Parse and repair JSON
  let parsedQuestions: QuizQuestionJSON[];
  try {
    const cleanedResponse = response.trim();
    const jsonMatch = cleanedResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      parsedQuestions = JSON.parse(jsonMatch[0]);
    } else {
      parsedQuestions = JSON.parse(cleanedResponse);
    }
  } catch (error) {
    console.error('[Quiz Generation] Failed to parse AI response:', response);
    throw new Error('Failed to parse generated questions');
  }

  // Validate and normalize
  return parsedQuestions.map((q, idx) => ({
    type: q.type === 'true-false' ? 'true-false' : 'multiple-choice',
    question: q.question || `Question ${idx + 1}`,
    options: q.type === 'multiple-choice' ? q.options?.slice(0, 4) : undefined,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation || 'Good job!',
    timestamp: typeof q.timestamp === 'number' ? q.timestamp : topics[idx % topics.length]?.segments?.[0]?.start,
  }));
}

async function handler(request: NextRequest) {
  try {
    const body = await request.json();

    let validatedData: QuizGenerationRequest;
    try {
      validatedData = quizGenerationSchema.parse(body);
    } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
      throw error;
    }

    const questions = await generateQuizQuestions(validatedData);

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Error generating quiz:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { error: 'Failed to generate quiz questions', details: errorMessage },
      { status: 500 }
    );
  }
}

export const POST = withSecurity(handler, SECURITY_PRESETS.PUBLIC);
