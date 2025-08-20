import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/ai/flows/transcribe-audio';
import { LangIntent } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { audioDataUri, languageIntent } = await req.json();

    if (!audioDataUri || !languageIntent) {
      return NextResponse.json({ error: 'Missing audioDataUri or languageIntent' }, { status: 400 });
    }

    const { transcription } = await transcribeAudio({ 
      audioDataUri, 
      languageIntent: languageIntent as LangIntent 
    });

    return NextResponse.json({ transcription });
  } catch (error) {
    console.error('Error in transcription API route:', error);
    return NextResponse.json({ error: 'Failed to transcribe audio' }, { status: 500 });
  }
}
