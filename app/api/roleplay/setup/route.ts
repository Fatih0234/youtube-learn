import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import OpenAI from 'openai';

const roleplayVoiceSchema = z.enum([
  'alloy',
  'echo',
  'fable',
  'onyx',
  'nova',
  'shimmer',
  'sage',
  'amber',
  'ash',
  'coral',
  'jade'
]);

const requestSchema = z.object({
  videoTitle: z.string().optional(),
  topic: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    excerpt: z.string().min(20)
  }),
  style: z.literal('real_world_conversation').default('real_world_conversation'),
  goalsCount: z.number().int().min(3).max(6).default(4),
  language: z.string().optional().default('en')
});

const responseSchema = z.object({
  scenario: z.object({
    title: z.string(),
    pitch: z.string(),
    instructions: z.string()
  }),
  character: z.object({
    name: z.string(),
    description: z.string(),
    background: z.string(),
    avatarPrompt: z.string().optional(),
    voice: roleplayVoiceSchema
  }),
  goals: z.array(z.object({
    id: z.string(),
    text: z.string(),
    completed: z.literal(false)
  })),
  openingInstruction: z.string()
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

function getLanguageName(code: string) {
  return code === 'es' ? 'Spanish'
    : code === 'fr' ? 'French'
    : code === 'de' ? 'German'
    : code === 'it' ? 'Italian'
    : 'English';
}

async function generateSetup(openai: OpenAI, input: z.infer<typeof requestSchema>) {
  const langName = getLanguageName(input.language);
  const allowedVoices = roleplayVoiceSchema.options.join(', ');

  const prompt = [
    'You are a product designer and language coach creating a 5-minute voice roleplay (call-like) for a learner.',
    '',
    'You MUST ground the roleplay in the provided YouTube video topic excerpt. Make it feel like a realistic conversation.',
    '',
    'Return ONLY valid JSON matching this schema exactly:',
    JSON.stringify({
      scenario: { title: 'string', pitch: 'string', instructions: 'string' },
      character: {
        name: 'string',
        description: 'string',
        background: 'string',
        avatarPrompt: 'string (optional)',
        voice: `one of: ${allowedVoices}`
      },
      goals: [{ id: 'string', text: 'string', completed: false }],
      openingInstruction: 'string'
    }),
    '',
    'Constraints:',
    `- Write all fields in ${langName}.`,
    '- scenario.title: short, user-facing, no period at end.',
    '- scenario.pitch: 1-2 sentences. Explain what the learner will practice.',
    '- scenario.instructions: 2-4 sentences with concrete steps. Must incorporate the topic content.',
    `- goals: exactly ${input.goalsCount} goals. Each goal should be specific, observable in conversation, and tied to the excerpt.`,
    `- goals[i].id MUST be string numbers "1" through "${input.goalsCount}" in order.`,
    `- character.voice must be one of: ${allowedVoices}.`,
    '- openingInstruction: a single instruction we will send to the AI to start the roleplay. It must make the AI speak first, set the scene quickly, and ask the learner the first question. Keep it short.',
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
    max_tokens: 900
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  const parsed = tryParseJsonObject(raw);
  const validated = responseSchema.parse(parsed);

  // Normalize goal ids/count to keep UI + evaluation stable.
  const normalizedGoals = Array.from({ length: input.goalsCount }, (_, idx) => {
    const id = String(idx + 1);
    const found = validated.goals.find(g => g.id === id) || validated.goals[idx];
    return {
      id,
      text: found?.text || `Goal ${id}`,
      completed: false as const
    };
  });

  return {
    ...validated,
    goals: normalizedGoals
  };
}

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const input = requestSchema.parse(body);

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment');
    }

    try {
      const setup = await generateSetup(openai, input);
      return NextResponse.json(setup);
    } catch (e) {
      // One repair attempt: ask the model to output valid JSON only.
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      console.warn('[roleplay/setup] first parse failed:', errMsg);

      const repair = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Repair the following to valid JSON matching the required schema. Output ONLY JSON, no markdown.'
          },
          {
            role: 'user',
            content: JSON.stringify({ input, error: errMsg })
          }
        ],
        temperature: 0.2,
        max_tokens: 900
      });

      const raw = repair.choices[0]?.message?.content ?? '';
      const parsed = tryParseJsonObject(raw);
      const setup = responseSchema.parse(parsed);
      return NextResponse.json(setup);
    }
  } catch (error) {
    console.error('Error in roleplay setup:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate roleplay setup', details: message },
      { status: 500 }
    );
  }
}

export const POST = withSecurity(handler, SECURITY_PRESETS.PUBLIC);
