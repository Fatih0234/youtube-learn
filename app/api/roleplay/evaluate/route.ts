import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import OpenAI from 'openai';

const requestSchema = z.object({
  scenario: z.object({
    title: z.string(),
    pitch: z.string(),
    instructions: z.string(),
  }),
  character: z.object({
    name: z.string(),
    description: z.string(),
    background: z.string(),
  }),
  goals: z.array(z.object({
    id: z.string(),
    text: z.string(),
  })),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
  language: z.string().optional().default('en'),
});

const responseSchema = z.object({
  overallSummary: z.string(),
  goals: z.array(z.object({
    id: z.string(),
    completed: z.boolean(),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
    tips: z.array(z.string()),
  })),
});

function tryParseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Try to extract the first JSON object in the string.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const candidate = raw.slice(start, end + 1);
      return JSON.parse(candidate);
    }
    throw new Error('Invalid JSON');
  }
}

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const input = requestSchema.parse(body);

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const languageName =
      input.language === 'es' ? 'Spanish'
      : input.language === 'fr' ? 'French'
      : input.language === 'de' ? 'German'
      : input.language === 'it' ? 'Italian'
      : 'English';

    const prompt = [
      'You are an expert language coach evaluating a short roleplay call.',
      '',
      'Return ONLY valid JSON that matches this exact schema:',
      JSON.stringify({
        overallSummary: 'string',
        goals: [
          {
            id: 'string',
            completed: 'boolean',
            strengths: ['string'],
            improvements: ['string'],
            tips: ['string'],
          },
        ],
      }),
      '',
      'Rules:',
      '- Output must be a single JSON object, no markdown, no code fences.',
      '- Evaluate EACH goal by id.',
      '- Each strengths/improvements/tips array should have 1-3 concise bullet-like sentences.',
      '- Strengths must be positive but specific.',
      '- Improvements must be clear and constructive.',
      '- Tips must be actionable (what to say next time, specific phrases, etc.).',
      `- Write in ${languageName}.`,
      '',
      'Scenario:',
      `Title: ${input.scenario.title}`,
      `Pitch: ${input.scenario.pitch}`,
      `Instructions: ${input.scenario.instructions}`,
      '',
      'AI character:',
      `Name: ${input.character.name}`,
      `Description: ${input.character.description}`,
      `Background: ${input.character.background}`,
      '',
      'Goals:',
      ...input.goals.map(g => `- (${g.id}) ${g.text}`),
      '',
      'Transcript (chronological):',
      ...input.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`),
    ].join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 900,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = tryParseJsonObject(raw);
    const validated = responseSchema.parse(parsed);

    // Ensure returned goals line up with requested goals (stable ordering).
    const requestedIds = new Set(input.goals.map(g => g.id));
    const normalizedGoals = input.goals.map(g => {
      const found = validated.goals.find(x => x.id === g.id);
      return found || {
        id: g.id,
        completed: false,
        strengths: [],
        improvements: ['Not enough evidence from the conversation to evaluate this goal.'],
        tips: [`Try to explicitly address: "${g.text}".`],
      };
    }).filter(g => requestedIds.has(g.id));

    return NextResponse.json({
      overallSummary: validated.overallSummary,
      goals: normalizedGoals,
    });
  } catch (error) {
    console.error('Error in roleplay evaluate:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to evaluate roleplay', details: message },
      { status: 500 }
    );
  }
}

export const POST = withSecurity(handler, SECURITY_PRESETS.PUBLIC);

