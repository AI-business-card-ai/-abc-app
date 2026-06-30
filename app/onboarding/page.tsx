'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClientComponent } from '@/lib/supabase'
import { normalizeAbcProfile } from '@/lib/profile-defaults'
import type { ABCProfile } from '@/lib/types'

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6

const ROLE_CHIPS = ['Founders', 'Sales Directors', 'VPs', 'CTOs', 'Marketing', 'HR']
const INDUSTRY_CHIPS = ['Tech', 'Finance', 'Healthcare', 'Manufacturing', 'Retail']
const SIZE_CHIPS = ['SMB', 'Mid-market', 'Enterprise']
const REGION_CHIPS = ['EU', 'US', 'Global']

const TONE_OPTIONS = ['Direct & Professional', 'Friendly & Casual']
const LANGUAGE_OPTIONS = ['EN', 'CZ']
const LENGTH_OPTIONS = ['Short & punchy', 'Medium']
const GOAL_OPTIONS = ['Schedule a meeting', 'Just connect']

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -40 : 40, opacity: 0 }),
}

const headlineStyle = { fontSize: 'clamp(28px, 6vw, 48px)', lineHeight: 1.15 } as const

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClientComponent()

  const [step, setStep] = useState<Step>(0)
  const [direction, setDirection] = useState(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [product, setProduct] = useState('')
  const [icp, setIcp] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([])
  const [selectedSizes, setSelectedSizes] = useState<string[]>([])
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [tone, setTone] = useState(TONE_OPTIONS[0])
  const [language, setLanguage] = useState(LANGUAGE_OPTIONS[0])
  const [messageLength, setMessageLength] = useState(LENGTH_OPTIONS[0])
  const [goal, setGoal] = useState(GOAL_OPTIONS[0])

  const progressStep = step >= 1 && step <= 5 ? step : null
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  const combinedIcp = useMemo(() => {
    const parts = [icp.trim()]
    if (selectedRoles.length) parts.push(`Target roles: ${selectedRoles.join(', ')}`)
    if (selectedIndustries.length) parts.push(`Industries: ${selectedIndustries.join(', ')}`)
    if (selectedSizes.length) parts.push(`Company size: ${selectedSizes.join(', ')}`)
    if (selectedRegions.length) parts.push(`Regions: ${selectedRegions.join(', ')}`)
    return parts.filter(Boolean).join('\n')
  }, [icp, selectedRoles, selectedIndustries, selectedSizes, selectedRegions])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('abc_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (data) {
        const profile = normalizeAbcProfile(data as Partial<ABCProfile>, user.email)
        if (profile.onboarding_completed) {
          setIsEditing(true)
        }
        setName(profile.full_name || '')
        setCompany(profile.company || '')
        setRole(profile.role || '')
        setProduct(profile.product_description || '')
        setIcp(profile.icp || '')
        const savedTone =
          profile.communication_style === 'casual'
            ? TONE_OPTIONS[1]
            : TONE_OPTIONS[0]
        setTone(TONE_OPTIONS.includes(savedTone) ? savedTone : TONE_OPTIONS[0])
        const savedLang = profile.outreach_language || 'EN'
        setLanguage(LANGUAGE_OPTIONS.includes(savedLang) ? savedLang : 'EN')
        const savedLen = profile.message_length || LENGTH_OPTIONS[0]
        setMessageLength(LENGTH_OPTIONS.includes(savedLen) ? savedLen : LENGTH_OPTIONS[0])
        const savedGoal = profile.message_goal || profile.goals || GOAL_OPTIONS[0]
        setGoal(GOAL_OPTIONS.includes(savedGoal) ? savedGoal : GOAL_OPTIONS[0])
      }
      setLoading(false)
    })()
  }, [router, supabase])

  useEffect(() => {
    const stepParam = new URLSearchParams(window.location.search).get('step')
    if (!stepParam) return
    const parsed = parseInt(stepParam, 10)
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 6) {
      setStep(parsed as Step)
      if (parsed >= 1) setIsEditing(true)
    }
  }, [])

  const goNext = useCallback(() => {
    setDirection(1)
    setStep((s) => Math.min(6, s + 1) as Step)
  }, [])

  const goBack = useCallback(() => {
    setDirection(-1)
    setStep((s) => Math.max(0, s - 1) as Step)
  }, [])

  const toggleChip = (
    value: string,
    selected: string[],
    setter: (v: string[]) => void
  ) => {
    setter(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  const canContinueStep2 = name.trim() && company.trim() && role.trim()
  const canContinueStep3 = product.trim().length >= 10
  const canContinueStep4 = icp.trim().length >= 10 || combinedIcp.length >= 10

  async function handleComplete() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim(),
          role: role.trim(),
          product: product.trim(),
          icp: combinedIcp,
          style: tone,
          language,
          goal,
          messageLength,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Setup failed')
      goNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center overflow-x-hidden" style={{ background: '#0f0f0f' }}>
        <div
          className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#00d4d4', borderRightColor: '#f0197d' }}
        />
      </div>
    )
  }

  return (
    <div
      className="min-h-[100dvh] flex flex-col overflow-x-hidden"
      style={{
        background: '#0f0f0f',
        color: '#ffffff',
        paddingLeft: 'max(20px, env(safe-area-inset-left))',
        paddingRight: 'max(20px, env(safe-area-inset-right))',
        paddingTop: 'max(24px, env(safe-area-inset-top))',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      }}
      onTouchStart={(e) => {
        swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }}
      onTouchEnd={(e) => {
        if (!swipeStart.current || step === 0 || step === 6) return
        const dx = e.changedTouches[0].clientX - swipeStart.current.x
        const dy = Math.abs(e.changedTouches[0].clientY - swipeStart.current.y)
        if (dy > 60) return
        if (dx < -60 && step < 5) {
          if (step === 1 && !canContinueStep2) return
          if (step === 2 && !canContinueStep3) return
          if (step === 3 && !canContinueStep4) return
          goNext()
        } else if (dx > 60) {
          goBack()
        }
        swipeStart.current = null
      }}
    >
      {progressStep !== null && (
        <div className="flex justify-center gap-2 mb-4 pt-1 shrink-0">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className="rounded-full transition-all duration-300"
              style={{
                width: progressStep === n ? 24 : 8,
                height: 8,
                background: n <= progressStep
                  ? 'linear-gradient(135deg, #f0197d, #00d4d4)'
                  : '#2a2a2a',
              }}
            />
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center min-h-0 overflow-y-auto overflow-x-hidden w-full max-w-lg mx-auto">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="flex flex-col gap-5 w-full"
          >
            {step === 0 && (
              <>
                <div className="text-center w-full">
                  <span className="gradient-logo text-4xl font-black tracking-widest">ABC</span>
                  <h1 className="mt-6 font-bold" style={headlineStyle}>
                    {isEditing ? 'Update your AI profile' : 'Set up your AI'}
                  </h1>
                  <p className="mt-3 text-base leading-relaxed" style={{ color: '#999999' }}>
                    {isEditing
                      ? 'Update your answers so ABC keeps writing perfect messages for every contact.'
                      : 'Five quick questions — then every card gets a personalized message in seconds.'}
                  </p>
                </div>
                <button type="button" onClick={goNext} className="glow-btn w-full rounded-xl font-bold text-base min-h-[56px]">
                  {isEditing ? 'Continue →' : 'Get Started →'}
                </button>
              </>
            )}

            {step === 1 && (
              <>
                <h2 className="font-bold" style={headlineStyle}>What&apos;s your name and what do you do?</h2>
                <div className="flex flex-col gap-3 w-full">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="onboarding-input" />
                  <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Your company" className="onboarding-input" />
                  <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Your role" className="onboarding-input" />
                </div>
                <NavButtons onBack={goBack} onNext={goNext} nextDisabled={!canContinueStep2} />
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="font-bold" style={headlineStyle}>What do you sell or offer?</h2>
                <textarea
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="e.g. We help sales teams close more deals with AI-powered outreach..."
                  className="onboarding-input min-h-[120px] py-4 resize-none w-full"
                />
                <NavButtons onBack={goBack} onNext={goNext} nextDisabled={!canContinueStep3} />
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="font-bold" style={headlineStyle}>Who is your ideal client?</h2>
                <textarea
                  value={icp}
                  onChange={(e) => setIcp(e.target.value)}
                  placeholder="e.g. Sales Directors at B2B tech companies in Europe..."
                  className="onboarding-input min-h-[88px] py-4 resize-none w-full"
                />
                <ChipGroup label="Role" options={ROLE_CHIPS} selected={selectedRoles} onToggle={(v) => toggleChip(v, selectedRoles, setSelectedRoles)} />
                <ChipGroup label="Industry" options={INDUSTRY_CHIPS} selected={selectedIndustries} onToggle={(v) => toggleChip(v, selectedIndustries, setSelectedIndustries)} />
                <ChipGroup label="Size" options={SIZE_CHIPS} selected={selectedSizes} onToggle={(v) => toggleChip(v, selectedSizes, setSelectedSizes)} />
                <ChipGroup label="Region" options={REGION_CHIPS} selected={selectedRegions} onToggle={(v) => toggleChip(v, selectedRegions, setSelectedRegions)} />
                <NavButtons onBack={goBack} onNext={goNext} nextDisabled={!canContinueStep4} />
              </>
            )}

            {step === 4 && (
              <>
                <h2 className="font-bold" style={headlineStyle}>Tone &amp; language</h2>
                <p className="text-sm" style={{ color: '#999999' }}>How should ABC sound when reaching out?</p>
                <SelectCards label="Tone" options={TONE_OPTIONS} value={tone} onChange={setTone} columns={2} />
                <SelectCards
                  label="Message language"
                  options={LANGUAGE_OPTIONS.map((l) => (l === 'EN' ? 'English' : 'Czech'))}
                  value={language === 'EN' ? 'English' : 'Czech'}
                  onChange={(v) => setLanguage(v === 'English' ? 'EN' : 'CZ')}
                  columns={2}
                />
                <NavButtons onBack={goBack} onNext={goNext} />
              </>
            )}

            {step === 5 && (
              <>
                <h2 className="font-bold" style={headlineStyle}>Length &amp; goal</h2>
                <p className="text-sm" style={{ color: '#999999' }}>What should each message achieve?</p>
                <SelectCards label="Message length" options={LENGTH_OPTIONS} value={messageLength} onChange={setMessageLength} columns={2} />
                <SelectCards label="Primary goal" options={GOAL_OPTIONS} value={goal} onChange={setGoal} columns={2} />
                {error && <p className="text-sm text-red-400">{error}</p>}
                <NavButtons
                  onBack={goBack}
                  onNext={handleComplete}
                  nextLabel={submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Complete Setup →'}
                  nextDisabled={submitting}
                />
              </>
            )}

            {step === 6 && (
              <>
                <div className="flex flex-col items-center text-center gap-4 py-2 w-full">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                    className="w-20 h-20 rounded-full flex items-center justify-center text-3xl"
                    style={{ background: 'rgba(34, 197, 94, 0.12)', border: '2px solid rgba(34, 197, 94, 0.45)', color: '#22c55e' }}
                  >
                    ✓
                  </motion.div>
                  <h2 className="font-bold" style={headlineStyle}>
                    You&apos;re all set, {name.split(' ')[0] || name}!
                  </h2>
                  <p className="text-base leading-relaxed max-w-sm" style={{ color: '#999999' }}>
                    ABC now knows your style and goals. Every contact you scan gets a personalized message.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => router.push('/scan')}
                  className="glow-btn w-full rounded-xl font-bold text-base min-h-[56px]"
                >
                  Start Scanning →
                </button>

                <div
                  className="w-full rounded-xl p-4 flex flex-col gap-3"
                  style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                >
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#555555' }}>
                    What to do next
                  </p>
                  {[
                    '📷 Scan any business card',
                    '🤖 AI writes personalized message in 10s',
                    '✉️ Send on LinkedIn, Email or WhatsApp',
                  ].map((tip) => (
                    <p key={tip} className="text-sm leading-snug" style={{ color: '#999999' }}>
                      {tip}
                    </p>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <style jsx global>{`
        .onboarding-input {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          background: #242424;
          border: 1px solid #2a2a2a;
          border-radius: 12px;
          color: #ffffff;
          padding: 0 16px;
          min-height: 56px;
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .onboarding-input:focus {
          border-color: #00d4d4;
          box-shadow: 0 0 0 3px rgba(0, 212, 212, 0.12);
        }
        .onboarding-input::placeholder {
          color: #555555;
        }
        .onboarding-chip {
          padding: 8px 12px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid #2a2a2a;
          color: #999999;
          background: #1a1a1a;
          transition: all 0.2s ease;
        }
        .onboarding-chip-active {
          background: rgba(0, 212, 212, 0.1);
          border-color: #00d4d4;
          color: #ffffff;
        }
        .onboarding-card {
          padding: 14px 12px;
          border-radius: 12px;
          border: 1px solid #2a2a2a;
          background: #1a1a1a;
          color: #999999;
          text-align: center;
          font-size: 15px;
          font-weight: 600;
          min-height: 52px;
          transition: all 0.2s ease;
          width: 100%;
        }
        .onboarding-card-active {
          border-color: #00d4d4;
          background: rgba(0, 212, 212, 0.08);
          color: #ffffff;
          box-shadow: 0 0 0 1px rgba(0, 212, 212, 0.2);
        }
      `}</style>
    </div>
  )
}

function NavButtons({
  onBack,
  onNext,
  nextDisabled,
  nextLabel = 'Continue →',
}: {
  onBack: () => void
  onNext: () => void
  nextDisabled?: boolean
  nextLabel?: string
}) {
  return (
    <div className="flex flex-col gap-3 w-full pt-2">
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="glow-btn w-full rounded-xl font-bold text-base min-h-[56px] disabled:opacity-40"
      >
        {nextLabel}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="ghost-btn w-full rounded-xl font-medium text-base min-h-[48px]"
      >
        Back
      </button>
    </div>
  )
}

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div className="w-full">
      <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#555555' }}>{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`onboarding-chip ${selected.includes(option) ? 'onboarding-chip-active' : ''}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function SelectCards({
  label,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
  columns?: 1 | 2
}) {
  return (
    <div className="w-full">
      <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#555555' }}>{label}</p>
      <div className={`grid gap-2 w-full ${columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`onboarding-card ${value === option ? 'onboarding-card-active' : ''}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}
