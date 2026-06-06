'use client'

import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  isVisible: boolean
  text?: string
}

export default function LoadingMatrix({ isVisible, text = 'AI analyzuje vizitku...' }: Props) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
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
            className="gradient-text text-5xl font-black tracking-widest mb-8 relative"
            style={{ filter: 'drop-shadow(0 0 24px rgba(124,58,237,0.5))' }}
          >
            ABC
          </motion.div>

          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 rounded-full mb-6 relative"
            style={{
              border: '2px solid transparent',
              borderTopColor: '#7C3AED',
              borderRightColor: '#0EA5E9',
              boxShadow: '0 0 20px rgba(124,58,237,0.3)',
            }}
          />

          <p className="text-text-secondary text-sm mb-4 relative">{text}</p>

          <div className="flex gap-1.5 relative">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ y: [0, -8, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #0EA5E9)' }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
