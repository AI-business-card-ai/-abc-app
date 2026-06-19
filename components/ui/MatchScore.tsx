'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface Props {
  score: number
  size?: number
}

export function scoreColors(score: number): { from: string; to: string; text: string } {
  if (score <= 40) return { from: '#F87171', to: '#DC2626', text: '#FCA5A5' }
  if (score <= 70) return { from: '#FBBF24', to: '#F97316', text: '#FDBA74' }
  return { from: '#4ADE80', to: '#16A34A', text: '#86EFAC' }
}

export default function MatchScore({ score, size = 88 }: Props) {
  const [displayScore, setDisplayScore] = useState(0)
  const radius = size / 2 - 8
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (displayScore / 100) * circumference
  const gradientId = 'match-score-gradient'
  const colors = scoreColors(score)
  const numberSize = Math.max(18, Math.round(size * 0.28))

  useEffect(() => {
    const timer = setTimeout(() => setDisplayScore(score), 150)
    return () => clearTimeout(timer)
  }, [score])

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colors.from} />
              <stop offset="100%" stopColor={colors.to} />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1A0E30"
            strokeWidth="6"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 6px ${colors.from}88)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-black" style={{ fontSize: numberSize, color: colors.text }}>
            {displayScore}
          </span>
        </div>
      </div>
      <span className="abc-label">Match</span>
    </div>
  )
}
