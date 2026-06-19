import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as File

    if (!audio) {
      return NextResponse.json({ error: 'No audio' }, { status: 400 })
    }

    const openaiFormData = new FormData()
    openaiFormData.append('file', audio, 'recording.webm')
    openaiFormData.append('model', 'whisper-1')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: openaiFormData,
    })

    if (!response.ok) {
      const err = await response.json()
      console.error('Whisper error:', err)
      return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
    }

    const data = await response.json()
    return NextResponse.json({ text: data.text })
  } catch (err) {
    console.error('Transcribe error:', err)
    return NextResponse.json({ error: 'Failed to transcribe' }, { status: 500 })
  }
}
