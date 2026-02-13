import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import OpenAI from 'openai';

const requestSchema = z.object({
  videoTitle: z.string().optional(),
  topic: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    excerpt: z.string().min(20)
  }),
  tone: z.enum(['casual', 'formal', 'academic']),
  length: z.enum(['short', 'medium', 'long']),
  targetWordCount: z.union([z.literal(50), z.literal(100), z.literal(200)]),
  vocabCount: z.number().int().min(4).max(12).default(6)
});

const responseSchema = z.object({
  prompt: z.object({
    title: z.string(),
    question: z.string(),
    constraints: z.array(z.string())
  }),
  suggestedVocab: z.array(z.string())
});

function tryParseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error('Invalid JSON');
  }
}

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const input = requestSchema.parse(body);

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment');
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const toneGuide =
      input.tone === 'casual'
        ? 'casual, natural, friendly'
        : input.tone === 'formal'
          ? 'formal, professional, polite'
          : 'academic, precise, structured';

    const prompt = [
      'You are a language tutor creating a writing exercise for a learner.',
      '',
      'Return ONLY valid JSON matching this schema exactly:',
      JSON.stringify({
        prompt: {
          title: 'string',
          question: 'string',
          constraints: ['string']
        },
        suggestedVocab: ['string']
      }),
      '',
      'Rules:',
      '- Output must be a single JSON object. No markdown, no code fences.',
      '- Write everything in English.',
      `- The writing should be ${toneGuide}.`,
      `- Aim for about ${input.targetWordCount} words.`,
      `- suggestedVocab must contain exactly ${input.vocabCount} useful words or short phrases taken from the excerpt.`,
      '- Avoid ultra-common filler words (e.g., "the", "and", "good").',
      '- Avoid proper nouns when possible.',
      '- Prompt must be grounded in the excerpt and topic title.',
      '',
      'Context:',
      `Video title: ${input.videoTitle || 'Unknown'}`,
      `Topic title: ${input.topic.title}`,
      `Topic description: ${input.topic.description || 'N/A'}`,
      '',
      'Topic excerpt (verbatim from transcript, for grounding):',
      input.topic.excerpt
    ].join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.7,
      max_tokens: 700
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = tryParseJsonObject(raw);
    const validated = responseSchema.parse(parsed);

    const suggestedVocab = validated.suggestedVocab
      .map((w) => String(w).trim())
      .filter(Boolean)
      .slice(0, input.vocabCount);

    // Ensure exact count for UI stability.
    while (suggestedVocab.length < input.vocabCount) {
      suggestedVocab.push(`word${suggestedVocab.length + 1}`);
    }

    return NextResponse.json({
      prompt: {
        title: validated.prompt.title.trim(),
        question: validated.prompt.question.trim(),
        constraints: validated.prompt.constraints.map((c) => String(c).trim()).filter(Boolean)
      },
      suggestedVocab
    });
  } catch (error) {
    console.error('Error in writing setup:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate writing prompt', details: message },
      { status: 500 }
    );
  }
}

export const POST = withSecurity(handler, SECURITY_PRESETS.PUBLIC);

