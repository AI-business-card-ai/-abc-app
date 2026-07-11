'use client'

import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  contactReadyForCrmExport,
  getCrmFieldLabel,
  getMissingCrmFields,
} from '@/lib/crm-mandatory-fields'
import type { ScannedContact } from '@/lib/types'

type Props = {
  contact: ScannedContact
}

export default function CrmMissingFieldsBanner({ contact }: Props) {
  const missing = getMissingCrmFields(contact).filter((f) => f === 'event_context')
  const visible = missing.length > 0

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="rounded-2xl p-4 mb-2"
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '2px solid rgba(245, 158, 11, 0.45)',
            boxShadow: '0 0 24px rgba(245, 158, 11, 0.08)',
          }}
        >
          <p className="text-sm font-bold mb-1" style={{ color: '#fbbf24' }}>
            ⚠ Missing data for CRM export
          </p>
          <p className="text-xs mb-3" style={{ color: '#fcd34d' }}>
            Add: {missing.map(getCrmFieldLabel).join(' · ')}
          </p>
          <Link
            href={`/scan?contextContact=${contact.id}`}
            className="inline-flex rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ background: 'linear-gradient(135deg, #f0197d, #00d4d4)', color: '#ffffff' }}
          >
            Edit in scan context →
          </Link>
          {!contactReadyForCrmExport(contact) && (
            <p className="text-[10px] mt-2" style={{ color: '#a3a3a3' }}>
              Meeting context is captured in the scan flow right after you photograph a card.
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
