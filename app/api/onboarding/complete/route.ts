import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createServiceClient } from '@/lib/supabase/service'
import { formatSupabaseError } from '@/lib/supabase-errors'
import { getLanguageInstruction } from '@/lib/ai-messages'
import { isValidCardSlug, normalizeCardSlug, slugifyName } from '@/lib/card/slug'
import { normalizeSocialUrl } from '@/lib/card/social'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

function mapStyleToCommunication(style: string): 'direct' | 'formal' | 'casual' {
  if (style.toLowerCase().includes('formal')) return 'formal'
  if (style.toLowerCase().includes('casual')) return 'casual'
  return 'direct'
}

/** One message for the browser, whatever went wrong underneath. */
const GENERIC_ERROR = 'Something went wrong saving your profile. Please try again.'

/**
 * A failure the caller can act on, and nothing they cannot.
 *
 * This used to hand back the Supabase `code` and `details` beside the message
 * and log the raw error object — database internals in a browser response, and
 * whatever the request carried in the logs. The server still records enough to
 * debug with: a short code and a formatted message, never the submitted body.
 */
function errorResponse(error: unknown, status = 500) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: string }).code || '')
    : undefined

  console.error('[onboarding/complete] failed', {
    status,
    code: code || 'unknown',
    message: formatSupabaseError(error),
  })

  return NextResponse.json({ error: GENERIC_ERROR }, { status })
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

/**
 * Publish the card, and finish onboarding, in one statement.
 *
 * These belong together. Onboarding used to be marked complete after the
 * messaging questions and before the card existed, so a visitor could skip the
 * card step and still be told "You're all set" while holding no public URL and
 * no QR — the product's whole first artifact, missing, reported as success.
 * Writing `card_published` and `onboarding_completed` in the same UPDATE makes
 * that state unreachable rather than merely discouraged.
 *
 * Completion is decided here rather than in the browser on purpose:
 * `onboarding_completed` is deliberately absent from PROFILE_WRITABLE_COLUMNS,
 * and this keeps it that way.
 *
 * No model call. A live card must not depend on Anthropic being reachable.
 */
async function completeCardStage(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
  email: string | null,
  body: Record<string, unknown>
) {
  const text = (value: unknown, max: number) =>
    typeof value === 'string' ? value.trim().slice(0, max) : ''

  const name = text(body.name, 120)
  const company = text(body.company, 120)
  const role = text(body.role, 120)

  if (!name || !company || !role) {
    return NextResponse.json({ error: 'Name, company and role are required.' }, { status: 400 })
  }

  // The slug the visitor chose, or one derived from their name. Normalised the
  // same way the field normalises it as they type, so what they saw is what is
  // reserved.
  const slug = normalizeCardSlug(text(body.cardSlug, 60) || slugifyName(name))
  if (!isValidCardSlug(slug)) {
    return NextResponse.json(
      { error: 'A card address needs 3–40 characters: letters, numbers and hyphens.' },
      { status: 400 }
    )
  }

  const photoUrl = text(body.cardPhotoUrl, 500) || null
  const linkedin = normalizeSocialUrl('linkedin', text(body.linkedin, 300))

  const payload = {
    full_name: name,
    company,
    role,
    job_title: role,
    company_name: company,
    card_slug: slug,
    card_published: true,
    card_photo_url: photoUrl,
    avatar_url: photoUrl,
    linkedin_url: linkedin,
    onboarding_completed: true,
  }

  const { data: existing, error: lookupError } = await serviceClient
    .from('abc_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (lookupError) return errorResponse(lookupError)

  const { error: writeError } = existing
    ? await serviceClient.from('abc_profiles').update(payload).eq('id', userId)
    : await serviceClient.from('abc_profiles').insert({ id: userId, email, ...payload })

  if (writeError) {
    // The slug is the one field another account can already be holding.
    if ((writeError as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'That card address is already taken. Try another one.' },
        { status: 409 }
      )
    }
    return errorResponse(writeError)
  }

  console.log('[onboarding/complete] card published', { userId, stage: 'card' })

  return NextResponse.json({ success: true, cardSlug: slug })
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
      stage?: string
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

    /*
      Two stages, one endpoint.

      `card` is the launch path: identity plus a published card, which is what
      finishing onboarding now means. `personalization` is the older body and
      stays the default, so anything still posting the original shape keeps
      working — it teaches ABC how to write follow-ups and no longer gates the
      card behind that.
    */
    if (body.stage === 'card') {
      return await completeCardStage(
        createServiceClient(),
        user.id,
        user.email ?? null,
        body as Record<string, unknown>
      )
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
