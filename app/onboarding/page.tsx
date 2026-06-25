'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClientComponent } from '@/lib/supabase'
import type { ABCProfile } from '@/lib/types'

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6

const ROLE_CHIPS = ['Founders', 'Sales Directors', 'VPs', 'CTOs', 'Marketing', 'HR']
const INDUSTRY_CHIPS = ['Tech', 'Finance', 'Healthcare', 'Manufacturing', 'Retail']
const SIZE_CHIPS = ['SMB', 'Mid-market', 'Enterprise']
const REGION_CHIPS = ['EU', 'US', 'Global']

const TONE_OPTIONS = ['Direct & Professional', 'Friendly & Casual', 'Formal']
const LANGUAGE_OPTIONS = ['EN', 'CZ', 'DE', 'Mix']
const LENGTH_OPTIONS = ['Short & punchy', 'Medium', 'Detailed']
const GOAL_OPTIONS = ['Schedule a meeting', 'Share resources', 'Just connect', 'Sell directly']

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
}

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
  const [messageLength, setMessageLength] = useState(LENGTH_OPTIONS[1])
  const [goal, setGoal] = useState(GOAL_OPTIONS[0])

  const stepLabel = step >= 1 && step <= 4 ? (step === 4 ? 5 : step) : null
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
        const profile = data as ABCProfile
        if (profile.onboarding_completed) {
          setIsEditing(true)
        }
        setName(profile.user_name || profile.full_name || '')
        setCompany(profile.user_company || profile.company || '')
        setRole(profile.user_role || profile.role || '')
        setProduct(profile.user_product || '')
        setIcp(profile.user_icp || '')
        setTone(profile.user_style || TONE_OPTIONS[0])
        setLanguage(profile.user_language ?? 'EN')
        setMessageLength(profile.user_message_length || LENGTH_OPTIONS[1])
        setGoal(profile.user_goal || profile.goals || GOAL_OPTIONS[0])
      }
      setLoading(false)
    })()
  }, [router, supabase])

  useEffect(() => {
    const stepParam = new URLSearchParams(window.location.search).get('step')
    if (!stepParam) return
    const parsed = parseInt(stepParam, 10)
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 5) {
      setStep(parsed as Step)
      if (parsed >= 1) setIsEditing(true)
    }
  }, [])

  const goNext = useCallback(() => {
    setDirection(1)
    setStep((s) => Math.min(5, s + 1) as Step)
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0f1a' }}>
        <div
          className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#00d4d4', borderRightColor: '#8b5cf6' }}
        />
      </div>
    )
  }

  return (
    <div
      className="min-h-[100dvh] flex flex-col px-5 py-6 safe-top safe-bottom"
      style={{ background: '#0d0f1a', color: '#f0f0ff' }}
      onTouchStart={(e) => {
        swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }}
      onTouchEnd={(e) => {
        if (!swipeStart.current || step === 0 || step === 5) return
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
      {step > 0 && step < 5 && (
        <div className="flex justify-center gap-2 mb-6 pt-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className="rounded-full transition-all duration-300"
              style={{
                width: stepLabel === n ? 24 : 8,
                height: 8,
                background: stepLabel !== null && n <= stepLabel
                  ? 'linear-gradient(135deg, #00d4d4, #8b5cf6)'
                  : 'rgba(139, 92, 246, 0.2)',
              }}
            />
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="flex flex-col gap-6"
          >
            {step === 0 && (
              <>
                <div className="text-center">
                  <span className="gradient-logo text-4xl font-black tracking-widest">ABC</span>
                  <h1 className="mt-6 font-bold" style={{ fontSize: 28 }}>
                    {isEditing ? 'Update your AI profile' : "Let's set up your AI assistant"}
                  </h1>
                  <p className="mt-3 text-sm leading-relaxed" style={{ color: '#8892b0' }}>
                    {isEditing
                      ? 'Update your answers so ABC keeps writing perfect messages for every contact.'
                      : 'Answer 5 quick questions so ABC can write perfect messages for every contact you meet.'}
                  </p>
                </div>
                <button type="button" onClick={goNext} className="glow-btn w-full rounded-xl font-bold text-lg" style={{ height: 64 }}>
                  {isEditing ? 'Continue →' : 'Get Started →'}
                </button>
              </>
            )}

            {step === 1 && (
              <>
                <h2 className="font-bold" style={{ fontSize: 28 }}>What&apos;s your name and what do you do?</h2>
                <div className="flex flex-col gap-3">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="onboarding-input" />
                  <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Your company" className="onboarding-input" />
                  <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Your role" className="onboarding-input" />
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={goBack} className="ghost-btn flex-1 rounded-xl font-medium" style={{ height: 64 }}>
                    Back
                  </button>
                  <button type="button" onClick={goNext} disabled={!canContinueStep2} className="glow-btn flex-[2] rounded-xl font-bold disabled:opacity-40" style={{ height: 64 }}>
                    Continue →
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="font-bold" style={{ fontSize: 28 }}>What do you sell or offer?</h2>
                <textarea
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="e.g. We help sales teams close more deals with AI-powered outreach automation..."
                  className="onboarding-input min-h-[140px] py-4 resize-none"
                />
                <div className="flex gap-3">
                  <button type="button" onClick={goBack} className="ghost-btn flex-1 rounded-xl font-medium" style={{ height: 64 }}>Back</button>
                  <button type="button" onClick={goNext} disabled={!canContinueStep3} className="glow-btn flex-[2] rounded-xl font-bold disabled:opacity-40" style={{ height: 64 }}>
                    Continue →
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="font-bold" style={{ fontSize: 28 }}>Who is your ideal client?</h2>
                <textarea
                  value={icp}
                  onChange={(e) => setIcp(e.target.value)}
                  placeholder="e.g. Sales Directors at B2B tech companies with 50-500 employees in Europe..."
                  className="onboarding-input min-h-[100px] py-4 resize-none"
                />
                <ChipGroup label="Role" options={ROLE_CHIPS} selected={selectedRoles} onToggle={(v) => toggleChip(v, selectedRoles, setSelectedRoles)} />
                <ChipGroup label="Industry" options={INDUSTRY_CHIPS} selected={selectedIndustries} onToggle={(v) => toggleChip(v, selectedIndustries, setSelectedIndustries)} />
                <ChipGroup label="Size" options={SIZE_CHIPS} selected={selectedSizes} onToggle={(v) => toggleChip(v, selectedSizes, setSelectedSizes)} />
                <ChipGroup label="Region" options={REGION_CHIPS} selected={selectedRegions} onToggle={(v) => toggleChip(v, selectedRegions, setSelectedRegions)} />
                <div className="flex gap-3">
                  <button type="button" onClick={goBack} className="ghost-btn flex-1 rounded-xl font-medium" style={{ height: 64 }}>Back</button>
                  <button type="button" onClick={goNext} disabled={!canContinueStep4} className="glow-btn flex-[2] rounded-xl font-bold disabled:opacity-40" style={{ height: 64 }}>
                    Continue →
                  </button>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <h2 className="font-bold" style={{ fontSize: 28 }}>How do you like to communicate?</h2>
                <SelectCards label="Tone" options={TONE_OPTIONS} value={tone} onChange={setTone} />
                <LanguageSelector value={language} onChange={setLanguage} />
                <SelectCards label="Length" options={LENGTH_OPTIONS} value={messageLength} onChange={setMessageLength} />
                <SelectCards label="Goal" options={GOAL_OPTIONS} value={goal} onChange={setGoal} />
                {error && <p className="text-sm text-red-300">{error}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={goBack} className="ghost-btn flex-1 rounded-xl font-medium" style={{ height: 64 }}>Back</button>
                  <button type="button" onClick={handleComplete} disabled={submitting} className="glow-btn flex-[2] rounded-xl font-bold disabled:opacity-40" style={{ height: 64 }}>
                    {submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Complete Setup →'}
                  </button>
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <div className="flex flex-col items-center text-center gap-4 py-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                    className="w-20 h-20 rounded-full flex items-center justify-center text-3xl"
                    style={{ background: 'rgba(34, 197, 94, 0.15)', border: '2px solid rgba(34, 197, 94, 0.5)', color: '#22c55e' }}
                  >
                    ✓
                  </motion.div>
                  <h2 className="font-bold" style={{ fontSize: 28 }}>You&apos;re all set, {name.split(' ')[0] || name}!</h2>
                  <p className="text-sm leading-relaxed max-w-sm" style={{ color: '#8892b0' }}>
                    ABC now knows your style and goals. Every contact you scan will get a perfectly personalized message.
                  </p>
                </div>
                <button type="button" onClick={() => router.push('/scan')} className="glow-btn w-full rounded-xl font-bold" style={{ height: 64 }}>
                  Start Scanning →
                </button>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <style jsx global>{`
        .onboarding-input {
          width: 100%;
          background: #1c1f35;
          border: 1px solid rgba(0, 212, 212, 0.2);
          border-radius: 12px;
          color: #f0f0ff;
          padding: 0 16px;
          height: 64px;
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .onboarding-input:focus {
          border-color: #00d4d4;
          box-shadow: 0 0 0 3px rgba(0, 212, 212, 0.12);
        }
        .onboarding-input::placeholder {
          color: #4a5168;
        }
        .onboarding-chip {
          padding: 8px 14px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid rgba(0, 212, 212, 0.45);
          color: #00d4d4;
          background: transparent;
          transition: all 0.2s ease;
        }
        .onboarding-chip-active {
          background: rgba(0, 212, 212, 0.15);
          border-color: #00d4d4;
          color: #f0f0ff;
        }
        .onboarding-card {
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(0, 212, 212, 0.25);
          background: #1c1f35;
          color: #8892b0;
          text-align: left;
          font-size: 14px;
          transition: all 0.2s ease;
        }
        .onboarding-card-active {
          border-color: #00d4d4;
          background: rgba(0, 212, 212, 0.1);
          color: #f0f0ff;
          box-shadow: 0 0 0 1px rgba(0, 212, 212, 0.2);
        }
      `}</style>
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
    <div>
      <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#4a5168' }}>{label}</p>
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

function LanguageSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#4a5168' }}>
        Language
      </p>
      <div className="grid grid-cols-4 gap-2">
        {LANGUAGE_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`onboarding-card ${value === option ? 'onboarding-card-active' : ''}`}
            style={
              option === 'EN'
                ? {
                    borderColor: value === 'EN' ? '#00d4d4' : 'rgba(0, 212, 212, 0.35)',
                    background: value === 'EN' ? 'rgba(0, 212, 212, 0.1)' : '#1c1f35',
                  }
                : undefined
            }
          >
            {option === 'EN' ? 'EN (Default)' : option}
          </button>
        ))}
      </div>
      <p className="text-xs mt-2 leading-relaxed" style={{ color: '#8892b0' }}>
        Default is English. Change only if you want messages in a different language.
      </p>
    </div>
  )
}

function SelectCards({
  label,
  options,
  value,
  onChange,
  compact,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
  compact?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#4a5168' }}>{label}</p>
      <div className={`grid gap-2 ${compact ? 'grid-cols-4' : 'grid-cols-1'}`}>
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
