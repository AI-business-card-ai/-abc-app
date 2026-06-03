'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface Props {
  score: number
  size?: number
}

export default function MatchScore({ score, size = 80 }: Props) {
  const [displayScore, setDisplayScore] = useState(0)
  const radius = (size / 2) - 8
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (displayScore / 100) * circumference
  const color = score > 75 ? '#7C3AED' : score > 50 ? '#0EA5E9' : '#4B5563'

  useEffect(() => {
    const timer = setTimeout(() => setDisplayScore(score), 100)
    return () => clearTimeout(timer)
  }, [score])

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#1A0E30" strokeWidth="6" />
          <motion.circle
            cx={size/2} cy={size/2} r={radius}
            fill="none" stroke={color} strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold" style={{ color }}>{displayScore}</span>
        </div>
      </div>
      <span className="text-[10px] text-[#3A2060]">Match</span>
    </div>
  )
}
