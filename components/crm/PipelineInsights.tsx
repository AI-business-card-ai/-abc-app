'use client'

import { useEffect, useState } from 'react'

export default function PipelineInsights() {
  const [insights, setInsights] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pipeline/insights')
      .then((r) => r.json())
      .then((json) => {
        setInsights(Array.isArray(json.insights) ? json.insights : [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div
        className="mb-5 rounded-2xl p-4 animate-pulse"
        style={{ background: '#141628', border: '1px solid rgba(139,92,246,0.12)', minHeight: 120 }}
      />
    )
  }

  if (insights.length === 0) return null

  return (
    <div
      className="mb-5 rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: '#141628', border: '1px solid rgba(139,92,246,0.15)' }}
    >
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#8b5cf6' }}>
        🤖 AI Pipeline Insights
      </p>
      {insights.map((line) => (
        <p key={line} className="text-sm leading-relaxed" style={{ color: '#f0f0ff' }}>
          {line}
        </p>
      ))}
    </div>
  )
}
