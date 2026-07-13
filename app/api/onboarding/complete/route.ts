import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { formatSupabaseError } from '@/lib/supabase-errors'
import { getLanguageInstruction } from '@/lib/ai-messages'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

function mapStyleToCommunication(style: string): 'direct' | 'formal' | 'casual' {
  if (style.toLowerCase().includes('formal')) return 'formal'
  if (style.toLowerCase().includes('casual')) return 'casual'
  return 'direct'
}

function errorResponse(error: unknown, status = 500) {
  const message = formatSupabaseError(error)
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: string }).code || '')
    : undefined
  const details = typeof error === 'object' && error !== null && 'details' in error
    ? String((error as { details?: string }).details || '')
    : undefined

  console.error('[onboarding/complete] failed', { message, code, details, raw: error })

  return NextResponse.json(
    {
      error: message,
      code: code || undefined,
      details: details || undefined,
    },
    { status }
  )
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
    // Onboarding completion writes ONLY to abc_profiles — never scanned_contacts or enrichment.
    const authClient = createRouteHandlerClient()
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser()

    if (userError) {
      return errorResponse(userError, 401)
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: no session user found' }, { status: 401 })
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
      try {
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
      } catch (promptError) {
        return errorResponse(promptError, 502)
      }
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

    const profilePayload = {
      full_name: name,
      company,
      role,
      product_description: product,
      icp,
      goals: goal,
      message_goal: goal,
      message_length: body.messageLength || null,
      communication_style: communicationStyle,
      outreach_language: language,
      system_prompt: userPrompt,
      onboarding_completed: true,
    }

    const serviceClient = createServiceClient()

    const { data: existingProfile, error: profileLookupError } = await serviceClient
      .from('abc_profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileLookupError) {
      return errorResponse(profileLookupError)
    }

    if (existingProfile) {
      const { error: updateError } = await serviceClient
        .from('abc_profiles')
        .update(profilePayload)
        .eq('id', user.id)

      if (updateError) {
        return errorResponse(updateError)
      }
    } else {
      const { error: insertError } = await serviceClient.from('abc_profiles').insert({
        id: user.id,
        email: user.email ?? null,
        ...profilePayload,
      })

      if (insertError) {
        if (insertError.code === '23505') {
          const { error: updateError } = await serviceClient
            .from('abc_profiles')
            .update(profilePayload)
            .eq('id', user.id)

          if (updateError) {
            return errorResponse(updateError)
          }
        } else {
          return errorResponse(insertError)
        }
      }
    }

    const { data: savedProfile, error: verifyError } = await serviceClient
      .from('abc_profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle()

    if (verifyError) {
      return errorResponse(verifyError)
    }

    if (!savedProfile?.onboarding_completed) {
      console.error('[onboarding/complete] verification failed — onboarding_completed not true', {
        userId: user.id,
        savedProfile,
      })
      return NextResponse.json(
        {
          error:
            'Profile was saved but onboarding completion was not confirmed. Please try again.',
        },
        { status: 500 }
      )
    }

    console.log('[onboarding/complete] abc_profiles saved only (no scanned_contacts, no enrichment)', {
      userId: user.id,
      created: !existingProfile,
      onboardingCompleted: savedProfile.onboarding_completed,
    })

    return NextResponse.json({ success: true, userPrompt })
  } catch (err) {
    return errorResponse(err)
  }
}
