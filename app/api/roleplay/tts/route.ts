import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import OpenAI from 'openai';

const ttsSchema = z.object({
  text: z.string().min(1).max(4096),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'sage', 'amber', 'ash', 'coral', 'jade']).default('alloy'),
  model: z.enum(['tts-1', 'tts-1-hd']).default('tts-1'),
});

type TTSRequest = z.infer<typeof ttsSchema>;

async function handler(request: NextRequest) {
  try {
    const body = await request.json();

    let validatedData: TTSRequest;
    try {
      validatedData = ttsSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Validation failed', details: error.issues },
          { status: 400 }
        );
      }
      throw error;
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment');
    }

    const mp3 = await openai.audio.speech.create({
      model: validatedData.model,
      voice: validatedData.voice,
      input: validatedData.text,
      response_format: 'wav',
    });

    // Get array buffer
    const arrayBuffer = await mp3.arrayBuffer();
    console.log('[TTS] Audio size:', arrayBuffer.byteLength, 'bytes');

    // Convert to base64
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    console.log('[TTS] Base64 length:', base64.length);

    return NextResponse.json({
      audio: `data:audio/wav;base64,${base64}`,
    });
  } catch (error) {
    console.error('Error in TTS:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { error: 'Failed to generate speech', details: errorMessage },
      { status: 500 }
    );
  }
}

export const POST = withSecurity(handler, SECURITY_PRESETS.PUBLIC);
