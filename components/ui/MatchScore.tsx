'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface Props {
  score: number
  size?: number
}

export default function MatchScore({ score, size = 88 }: Props) {
  const [displayScore, setDisplayScore] = useState(0)
  const radius = size / 2 - 8
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (displayScore / 100) * circumference
  const gradientId = 'match-score-gradient'

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
              <stop offset="0%" stopColor="#7C3AED" />
              <stop offset="100%" stopColor="#0EA5E9" />
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
            style={{ filter: 'drop-shadow(0 0 6px rgba(124,58,237,0.5))' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black gradient-text">{displayScore}</span>
        </div>
      </div>
      <span className="abc-label">Match</span>
    </div>
  )
}
