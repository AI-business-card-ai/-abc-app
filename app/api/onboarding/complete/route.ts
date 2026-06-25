import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { getLanguageInstruction } from '@/lib/ai-messages'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

function mapStyleToCommunication(style: string): 'direct' | 'formal' | 'casual' {
  if (style.toLowerCase().includes('formal')) return 'formal'
  if (style.toLowerCase().includes('casual')) return 'casual'
  return 'direct'
}

async function generateUserPrompt(input: {
  name: string
  company: string
  role: string
  product: string
  icp: string
  style: string
  language: string
  goal: string
  messageLength?: string
}): Promise<string> {
  const lengthLine = input.messageLength ? `Message length preference: ${input.messageLength}.` : ''
  const userLang = input.language ?? 'EN'
  const LANGUAGE_INSTRUCTION = getLanguageInstruction(userLang)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: `${LANGUAGE_INSTRUCTION}

Language rule: ${LANGUAGE_INSTRUCTION}
This is the most important instruction. Override any other language tendencies.

You create concise AI assistant profiles for B2B sales professionals.`,
    messages: [
      {
        role: 'user',
        content: `Create a 3-4 sentence system context for an AI that writes personalized B2B messages.
User: ${input.name} from ${input.company}, role: ${input.role}
Product/service: ${input.product}
Ideal client: ${input.icp}
Style: ${input.style}, Language: ${userLang}, Goal: ${input.goal}
${lengthLine}
The generated context must instruct the AI to write outreach messages in the language specified above.
Output ONLY the context text, no labels or formatting.`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  const langPhrase =
    userLang === 'CZ'
      ? 'in Czech'
      : userLang === 'DE'
        ? 'in German'
        : userLang === 'Mix'
          ? 'mixing Czech and English'
          : 'in English only'
  return (
    text ||
    `You write personalized B2B outreach for ${input.name} at ${input.company}. Focus on ${input.goal.toLowerCase()} with a ${input.style.toLowerCase()} tone ${langPhrase}.`
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as {
      name?: string
      company?: string
      role?: string
      product?: string
      icp?: string
      style?: string
      language?: string
      goal?: string
      messageLength?: string
    }

    const name = body.name?.trim()
    const company = body.company?.trim()
    const role = body.role?.trim()
    const product = body.product?.trim()
    const icp = body.icp?.trim()
    const style = body.style?.trim()
    const language = body.language?.trim() || 'EN'
    const goal = body.goal?.trim()

    if (!name || !company || !role || !product || !icp || !style || !language || !goal) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    let userPrompt = ''
    if (process.env.ANTHROPIC_API_KEY) {
      userPrompt = await generateUserPrompt({
        name,
        company,
        role,
        product,
        icp,
        style,
        language,
        goal,
        messageLength: body.messageLength,
      })
    } else {
      const userLang = language ?? 'EN'
      const langPhrase =
        userLang === 'CZ'
          ? 'in Czech'
          : userLang === 'DE'
            ? 'in German'
            : userLang === 'Mix'
              ? 'mixing Czech and English'
              : 'in English only'
      userPrompt = `You write personalized B2B outreach for ${name} at ${company}. Target ideal clients matching: ${icp}. Communicate in a ${style} tone ${langPhrase}, with the goal to ${goal.toLowerCase()}.`
    }

    const communicationStyle = mapStyleToCommunication(style)

    console.log('Saving language:', language)

    const { error } = await supabase
      .from('abc_profiles')
      .upsert({
        id: user.id,
        user_name: name,
        user_company: company,
        user_role: role,
        user_product: product,
        user_goal: goal,
        user_icp: icp,
        user_style: style,
        user_language: language,
        user_message_length: body.messageLength || null,
        user_prompt: userPrompt,
        onboarding_completed: true,
        full_name: name,
        company,
        role,
        goals: goal,
        communication_style: communicationStyle,
        outreach_language: language,
      })

    if (error) throw error

    return NextResponse.json({ success: true, userPrompt })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onboarding failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
