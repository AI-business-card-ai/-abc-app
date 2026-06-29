'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconCamera,
  IconCards,
  IconLayoutKanban,
  IconMessage,
  IconUser,
} from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'

const NAV = [
  { icon: IconCamera, label: 'Scan', path: '/scan' },
  { icon: IconCards, label: 'Contacts', path: '/contacts' },
  { icon: IconLayoutKanban, label: 'Pipeline', path: '/pipeline' },
  { icon: IconMessage, label: 'Chat', path: '/chat' },
  { icon: IconUser, label: 'Profile', path: '/profile' },
]

export default function DesktopSidebar() {
  const pathname = usePathname()
  const supabase = createClientComponent()
  const [name, setName] = useState('ABC User')
  const [avatar, setAvatar] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('abc_profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()
      if (data?.full_name) setName(data.full_name)
      if (data?.avatar_url) setAvatar(data.avatar_url)
    })()
  }, [supabase])

  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || 'AB'

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-[220px] flex flex-col z-40"
      style={{
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <div className="px-5 pt-6 pb-8">
        <span className="gradient-logo text-lg font-black tracking-wide">ABC</span>
        <p
          className="text-[10px] mt-0.5 uppercase font-semibold"
          style={{ color: 'var(--text-secondary)', letterSpacing: '2px' }}
        >
          AI Business Card
        </p>
      </div>

      <nav className="flex-1 px-3 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              href={item.path}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={
                active
                  ? {
                      background: 'var(--bg-surface-2)',
                      color: 'var(--accent-turquoise)',
                      borderLeft: '3px solid var(--accent-turquoise)',
                      paddingLeft: '9px',
                    }
                  : {
                      color: 'var(--text-secondary)',
                      borderLeft: '3px solid transparent',
                      paddingLeft: '9px',
                    }
              }
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'var(--bg-surface-2)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }
              }}
            >
              <item.icon size={18} style={{ color: active ? 'var(--accent-turquoise)' : 'inherit' }} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-5 border-t" style={{ borderColor: 'var(--border)' }}>
        <Link href="/profile" className="flex items-center gap-3 group">
          {avatar ? (
            <div className="gradient-ring shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
            </div>
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{
                background: 'var(--accent-gradient)',
                color: '#fff',
              }}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {name}
            </p>
            <p className="text-[10px] group-hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
              Settings →
            </p>
          </div>
        </Link>
      </div>
    </aside>
  )
}
