'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { IconChevronRight } from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import GradientAvatar from '@/components/ui/GradientAvatar'
import type { ScannedContact } from '@/lib/types'

function cleanPreview(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function getMessagePreview(contact: ScannedContact): string {
  const type = (contact.last_message_type || '').toLowerCase()
  if (type.includes('email') && contact.message_email) {
    return cleanPreview(contact.message_email)
  }
  if (type.includes('whatsapp') && contact.message_whatsapp) {
    return cleanPreview(contact.message_whatsapp)
  }
  if (type.includes('linkedin') && contact.message_linkedin) {
    return cleanPreview(contact.message_linkedin)
  }
  if (contact.message_linkedin) return cleanPreview(contact.message_linkedin)
  if (contact.message_email) return cleanPreview(contact.message_email)
  if (contact.message_whatsapp) return cleanPreview(contact.message_whatsapp)
  if (contact.reply_received) return 'Reply received'
  return contact.last_message_type ? `${contact.last_message_type} message sent` : 'Message sent'
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ChatListPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClientComponent(), [])

  const [contacts, setContacts] = useState<ScannedContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data, error: e } = await supabase
        .from('scanned_contacts')
        .select('*')
        .eq('user_id', user.id)
        .or('messages_sent.gt.0,reply_received.eq.true')
        .order('last_message_date', { ascending: false, nullsFirst: false })

      if (!active) return
      if (e) {
        setError(e.message)
      } else {
        const rows = ((data as ScannedContact[]) ?? []).filter(
          (c) => (c.messages_sent ?? 0) > 0 || c.reply_received === true
        )
        rows.sort((a, b) => {
          const aTime = a.last_message_date ? new Date(a.last_message_date).getTime() : 0
          const bTime = b.last_message_date ? new Date(b.last_message_date).getTime() : 0
          return bTime - aTime
        })
        setContacts(rows)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [router, supabase])

  return (
    <div className="min-h-screen pb-8 page-shell pt-6">
      <div className="hero-radial pb-4">
        <h1 className="gradient-text page-heading font-black tracking-wide relative">CHAT</h1>
        <p className="text-xs text-text-secondary mt-0.5 relative">Conversations with your contacts</p>
      </div>

      <div className="flex flex-col gap-2.5 px-4">
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="w-7 h-7 rounded-full border-2 border-transparent border-t-primary border-r-secondary animate-spin" />
            <p className="text-sm text-text-secondary">Loading...</p>
          </div>
        ) : error ? (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
        ) : contacts.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '60vh',
              gap: '16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg,#00d4d4,#8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
              }}
            >
              💬
            </div>

            <div style={{ fontSize: '20px', fontWeight: '700', color: '#f0f0ff' }}>
              No active conversations yet
            </div>

            <div style={{ fontSize: '14px', color: '#6b7280', maxWidth: '320px', lineHeight: '1.6' }}>
              Once you scan a business card and send a message, your conversations will appear here.
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link
                href="/scan"
                className="interactive-primary"
                style={{
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg,#f0197d,#8b5cf6)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                📷 Scan a card
              </Link>
              <Link
                href="/contacts"
                className="interactive"
                style={{
                  padding: '12px 24px',
                  background: 'transparent',
                  border: '1px solid #2a2d3e',
                  borderRadius: '10px',
                  color: '#6b7280',
                  fontSize: '14px',
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                View contacts →
              </Link>
            </div>
          </div>
        ) : (
          contacts.map((c) => {
            const initials =
              c.name
                ?.split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase() ?? '?'
            const replied = c.reply_received === true
            const preview = getMessagePreview(c)
            const timestamp = formatTimestamp(c.last_message_date || c.response_date)

            return (
              <motion.button
                key={c.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push(`/chat/${c.id}`)}
                className="interactive abc-card flex items-center gap-3 p-3.5 text-left w-full transition-colors hover:border-primary/30"
              >
                <GradientAvatar initials={initials} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-text-primary truncate">{c.name ?? 'Unknown'}</p>
                    {timestamp && (
                      <span className="text-[10px] text-text-secondary shrink-0">{timestamp}</span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary truncate">{preview}</p>
                </div>
                <span
                  className="text-[10px] shrink-0 flex items-center gap-1"
                  style={{ color: replied ? '#34D399' : '#8892b0' }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: replied ? '#34D399' : '#8892b0' }}
                  />
                  {replied ? 'Replied' : 'Sent'}
                </span>
                <IconChevronRight size={16} className="text-muted shrink-0" />
              </motion.button>
            )
          })
        )}
      </div>
    </div>
  )
}
