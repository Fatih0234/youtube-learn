import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import OpenAI from 'openai';

const requestSchema = z.object({
  videoTitle: z.string().optional(),
  topic: z.object({
    id: z.string(),
    title: z.string(),
    excerpt: z.string().min(20)
  }),
  prompt: z.object({
    title: z.string(),
    question: z.string()
  }),
  tone: z.enum(['casual', 'formal', 'academic']),
  targetWordCount: z.number().int().min(30).max(400),
  suggestedVocab: z.array(z.string()).max(20),
  userText: z.string().min(10).max(5000)
});

const responseSchema = z.object({
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  actionableTips: z.array(z.string()),
  suggestedRewrite: z.string(),
  vocabUsed: z.array(z.string()),
  vocabMissed: z.array(z.string())
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

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeVocabUsage(userText: string, vocab: string[]) {
  const text = userText.toLowerCase();
  const used: string[] = [];
  const missed: string[] = [];

  for (const raw of vocab) {
    const term = String(raw || '').trim();
    if (!term) continue;
    const lower = term.toLowerCase();

    const isSingleWord = /^[a-z0-9']+$/i.test(term);
    const found = isSingleWord
      ? new RegExp(`\\b${escapeRegex(lower)}\\b`, 'i').test(userText)
      : text.includes(lower);

    (found ? used : missed).push(term);
  }

  return { used, missed };
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

    const vocabUsage = computeVocabUsage(input.userText, input.suggestedVocab);

    const prompt = [
      'You are an expert English writing tutor for language learners.',
      '',
      'Return ONLY valid JSON matching this schema exactly:',
      JSON.stringify({
        strengths: ['string'],
        improvements: ['string'],
        actionableTips: ['string'],
        suggestedRewrite: 'string',
        vocabUsed: ['string'],
        vocabMissed: ['string']
      }),
      '',
      'Rules:',
      '- Output must be a single JSON object. No markdown, no code fences.',
      '- Write everything in English.',
      '- Feedback should be concise but specific.',
      '- strengths/improvements/actionableTips: 2-4 items each.',
      `- suggestedRewrite must follow a ${toneGuide} tone and aim for about ${input.targetWordCount} words.`,
      '- suggestedRewrite should preserve the user’s meaning where possible, but fix grammar and improve natural phrasing.',
      '- Do not invent facts not supported by the excerpt/topic.',
      '',
      'Context:',
      `Video title: ${input.videoTitle || 'Unknown'}`,
      `Topic title: ${input.topic.title}`,
      '',
      'Topic excerpt (for grounding, do not quote excessively):',
      input.topic.excerpt,
      '',
      'Writing prompt:',
      `Title: ${input.prompt.title}`,
      `Question: ${input.prompt.question}`,
      '',
      'Suggested vocabulary (optional to use):',
      input.suggestedVocab.join(', '),
      '',
      'Vocabulary usage detected in the user text:',
      `Used: ${vocabUsage.used.join(', ') || 'none'}`,
      `Missed: ${vocabUsage.missed.join(', ') || 'none'}`,
      '',
      'User text to review:',
      input.userText
    ].join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.3,
      max_tokens: 900
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = tryParseJsonObject(raw);
    const validated = responseSchema.parse(parsed);

    // Trust our deterministic vocab usage lists for stability.
    return NextResponse.json({
      strengths: validated.strengths.map((s) => String(s).trim()).filter(Boolean),
      improvements: validated.improvements.map((s) => String(s).trim()).filter(Boolean),
      actionableTips: validated.actionableTips.map((s) => String(s).trim()).filter(Boolean),
      suggestedRewrite: String(validated.suggestedRewrite || '').trim(),
      vocabUsed: vocabUsage.used,
      vocabMissed: vocabUsage.missed
    });
  } catch (error) {
    console.error('Error in writing feedback:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate writing feedback', details: message },
      { status: 500 }
    );
  }
}

export const POST = withSecurity(handler, SECURITY_PRESETS.PUBLIC);

