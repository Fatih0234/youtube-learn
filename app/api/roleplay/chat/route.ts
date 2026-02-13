import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import OpenAI from 'openai';

const chatSchema = z.object({
  scenario: z.union([
    z.string(),
    z.object({
      title: z.string(),
      pitch: z.string(),
      instructions: z.string(),
    }),
  ]),
  character: z.object({
    name: z.string(),
    description: z.string(),
    voice: z.string(),
    background: z.string().optional(),
  }),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
  userMessage: z.string(),
  goals: z.array(z.object({
    id: z.string(),
    text: z.string(),
    completed: z.boolean(),
  })).optional(),
  language: z.string().optional().default('en'),
});

type ChatRequest = z.infer<typeof chatSchema>;

async function generateRoleplayResponse(request: ChatRequest) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const { scenario, character, messages, userMessage, goals, language } = request;
  const scenarioText =
    typeof scenario === 'string'
      ? scenario
      : `Title: ${scenario.title}\nPitch: ${scenario.pitch}\nInstructions: ${scenario.instructions}`;

  // Build conversation context
  const goalContext = goals?.length 
    ? `\n\nUser's learning goals to encourage:\n${goals.filter(g => !g.completed).map(g => `- ${g.text}`).join('\n')}`
    : '';

  const backgroundLine = character.background ? `\n\nCharacter background:\n${character.background}` : '';

  const systemPrompt = `You are ${character.name}, a ${character.description} in the following roleplay scenario:
\n${scenarioText}${backgroundLine}

Your personality:
- Speak in a natural, conversational way
- Keep responses relatively short (1-3 sentences for most responses)
- Use appropriate tone based on your character
- Be friendly and helpful

Language: Respond in ${language === 'es' ? 'Spanish' : language === 'fr' ? 'French' : language === 'de' ? 'German' : language === 'it' ? 'Italian' : 'English'}.

Context: This is a language learning exercise. Help the user practice by:
- Responding naturally to their questions
- Asking follow-up questions when appropriate
- Gently correcting or suggesting better phrases if needed${goalContext}

Conversation history:
${messages.map(m => `${m.role === 'user' ? 'User' : character.name}: ${m.content}`).join('\n')}

Respond as ${character.name}.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  return completion.choices[0]?.message?.content || "I'm sorry, I didn't catch that. Could you try again?";
}

async function handler(request: NextRequest) {
  try {
    const body = await request.json();

    let validatedData: ChatRequest;
    try {
      validatedData = chatSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Validation failed', details: error.issues },
          { status: 400 }
        );
      }
      throw error;
    }

    const responseText = await generateRoleplayResponse(validatedData);

    return NextResponse.json({ 
      response: responseText,
    });
  } catch (error) {
    console.error('Error in roleplay chat:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { error: 'Failed to generate response', details: errorMessage },
      { status: 500 }
    );
  }
}

export const POST = withSecurity(handler, SECURITY_PRESETS.PUBLIC);
