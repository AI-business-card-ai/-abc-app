'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  contactReadyForCrmExport,
  getCrmFieldLabel,
  getMissingCrmFields,
} from '@/lib/crm-mandatory-fields'
import type { ScannedContact } from '@/lib/types'

type Props = {
  contact: ScannedContact
  onContactUpdated: (contact: ScannedContact) => void
  onFocusEvent?: () => void
}

export default function CrmMissingFieldsBanner({ contact, onContactUpdated, onFocusEvent }: Props) {
  const [filling, setFilling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const missing = getMissingCrmFields(contact)
  const visible = missing.length > 0

  async function fillCompanyFields() {
    setFilling(true)
    setError(null)
    try {
      const res = await fetch('/api/contact/fill-crm-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fill fields')
      onContactUpdated(data.contact as ScannedContact)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fill fields')
    } finally {
      setFilling(false)
    }
  }

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
            ⚠ Chybí data pro CRM export
          </p>
          <p className="text-xs mb-3" style={{ color: '#fcd34d' }}>
            Doplň: {missing.map(getCrmFieldLabel).join(' · ')}
          </p>
          <div className="flex flex-wrap gap-2">
            {missing.some((f) => f !== 'event_context') && (
              <button
                type="button"
                disabled={filling}
                onClick={() => void fillCompanyFields()}
                className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                style={{ background: '#242424', border: '1px solid #fbbf24', color: '#ffffff' }}
              >
                {filling ? 'AI doplňuje…' : 'Doplnit velikost / obrat / HQ (AI)'}
              </button>
            )}
            {missing.includes('event_context') && (
              <button
                type="button"
                onClick={onFocusEvent}
                className="rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: 'linear-gradient(135deg, #f0197d, #00d4d4)', color: '#ffffff' }}
              >
                Doplnit kde jste se potkali ↓
              </button>
            )}
          </div>
          {error && (
            <p className="text-xs mt-2" style={{ color: '#fca5a5' }}>
              {error}
            </p>
          )}
          {!contactReadyForCrmExport(contact) && (
            <p className="text-[10px] mt-2" style={{ color: '#a3a3a3' }}>
              Export do Salesforce/HubSpot bude dostupný po doplnění všech polí.
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
