'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const SCAN_STEPS = [
  'Analyzování kontaktu...',
  'Zjišťování informací o firmě...',
  'Prohledávání webu...',
  'Příprava zpráv...',
  'Dokončování...',
]

const STEP_DURATION_MS = 2500

interface Props {
  isVisible: boolean
}

export default function LoadingMatrix({ isVisible }: Props) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (!isVisible) {
      setStepIndex(0)
      return
    }

    const interval = setInterval(() => {
      setStepIndex((prev) => Math.min(prev + 1, SCAN_STEPS.length - 1))
    }, STEP_DURATION_MS)

    return () => clearInterval(interval)
  }, [isVisible])

  const progress = ((stepIndex + 1) / SCAN_STEPS.length) * 100

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8"
          style={{ background: 'rgba(7, 5, 14, 0.97)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(124,58,237,0.2), transparent)',
            }}
          />

          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="gradient-text text-5xl font-black tracking-widest mb-4 relative"
            style={{ filter: 'drop-shadow(0 0 24px rgba(124,58,237,0.5))' }}
          >
            ABC
          </motion.div>

          <p className="text-sm text-center mb-8 relative min-h-[20px]" style={{ color: '#A78BFA' }}>
            {SCAN_STEPS[stepIndex]}
          </p>

          <div className="w-full max-w-xs relative">
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: '#1A0E30' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #7C3AED, #0EA5E9)' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
            <p className="text-center text-xs mt-2 tabular-nums" style={{ color: '#3A2060' }}>
              {Math.round(progress)}%
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
