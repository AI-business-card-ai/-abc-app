'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="abc-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] text-left"
      >
        <span className="abc-label flex items-center gap-2">
          {icon && <span>{icon}</span>}
          {title}
        </span>
        <span style={{ color: '#8892b0' }}>{open ? '−' : '+'}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-4"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
