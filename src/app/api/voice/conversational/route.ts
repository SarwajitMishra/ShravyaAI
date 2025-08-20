
import { NextRequest, NextResponse } from 'next/server';
import { conversationalResponse } from '@/ai/flows/conversational-response';
import { Persona } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { history, persona } = await req.json();

    if (!history || !persona) {
      return NextResponse.json({ error: 'Missing history or persona' }, { status: 400 });
    }

    const { response, audio } = await conversationalResponse({ 
      history, 
      persona: persona as Persona 
    });

    return NextResponse.json({ response, audio });
  } catch (error) {
    console.error('Error in conversational API route:', error);
    return NextResponse.json({ error: 'Failed to get conversational response' }, { status: 500 });
  }
}
