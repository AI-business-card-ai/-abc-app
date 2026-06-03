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
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#07050E]"
          style={{ background: 'rgba(7,5,14,0.97)' }}
        >
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="gradient-text text-4xl font-black tracking-widest mb-8"
            style={{ filter: 'drop-shadow(0 0 20px #7C3AED)' }}
          >
            ABC
          </motion.div>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 rounded-full mb-6"
            style={{ border: '2px solid transparent', borderTopColor: '#7C3AED', borderRightColor: '#0EA5E9' }}
          />
          <p className="text-[#6B7280] text-sm mb-4">{text}</p>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.2 }}
                className="w-1.5 h-1.5 rounded-full bg-[#7C3AED]"
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
