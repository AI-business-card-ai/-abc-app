'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

type ProfileConnections = {
  google_connected?: boolean
  google_email?: string | null
  email?: string | null
  hubspot_access_token?: string | null
  salesforce_access_token?: string | null
}

type Props = {
  profile: ProfileConnections
  onRefresh: () => void
}

const rowStyle = {
  background: '#1a1a1a',
  border: '1px solid #2a2a2a',
  borderRadius: '12px',
} as const

function ConnectRow({
  logo,
  connected,
  connectedText,
  connectHref,
  connectLabel,
}: {
  logo: ReactNode
  connected: boolean
  connectedText: string
  connectHref: string
  connectLabel: string
}) {
  const [hover, setHover] = useState(false)

  if (connected) {
    return (
      <div
        className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
        style={rowStyle}
      >
        {logo}
        <span style={{ color: '#ffffff', fontWeight: 600 }}>{connectedText}</span>
      </div>
    )
  }

  return (
    <a
      href={connectHref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="w-full flex items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 no-underline"
      style={{
        ...rowStyle,
        color: '#ffffff',
        border: hover ? '1px solid rgba(0, 212, 212, 0.35)' : rowStyle.border,
        boxShadow: hover
          ? '0 0 24px rgba(240, 25, 125, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
          : 'none',
      }}
    >
      {logo}
      {connectLabel}
    </a>
  )
}

function SalesforceLogo() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        background: '#0176D3',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        flexShrink: 0,
      }}
    >
      ☁️
    </span>
  )
}

function HubSpotLogo() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        background: '#FF7A59',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        flexShrink: 0,
      }}
    >
      🧡
    </span>
  )
}

export default function ConnectionsSection({ profile, onRefresh }: Props) {
  const router = useRouter()
  const [hubspotError, setHubspotError] = useState<string | null>(null)
  const [salesforceError, setSalesforceError] = useState<string | null>(null)

  const hubspotConnected = Boolean(profile.hubspot_access_token)
  const salesforceConnected = Boolean(profile.salesforce_access_token)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const crm = params.get('crm')
    if (!crm) return

    const profilePath = window.location.pathname.startsWith('/profile') ? '/profile' : '/settings'

    if (crm === 'hubspot-connected') {
      setHubspotError(null)
      onRefresh()
      router.replace(profilePath)
    } else if (crm === 'hubspot-error') {
      setHubspotError('HubSpot connection failed. Please try again.')
      router.replace(profilePath)
    } else if (crm === 'salesforce-connected') {
      setSalesforceError(null)
      onRefresh()
      router.replace(profilePath)
    } else if (crm === 'salesforce-error') {
      setSalesforceError('Salesforce connection failed. Please try again.')
      router.replace(profilePath)
    }
  }, [onRefresh, router])

  return (
    <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px', marginBottom: '16px' }}>
      <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '12px' }}>
        CONNECTIONS
      </div>

      <div className="flex flex-col gap-3">
        <div style={{ fontSize: '10px', color: '#8892b0', letterSpacing: '0.06em', marginBottom: '-4px' }}>
          EMAIL
        </div>
        {profile.google_connected ? (
          <p style={{ margin: 0, fontSize: '14px', color: '#ffffff' }}>
            Email ✅ Connected ({profile.google_email || profile.email || '—'})
          </p>
        ) : (
          <GoogleSignInButton nextPath="/settings" label="Connect Email" />
        )}

        <ConnectRow
          logo={<SalesforceLogo />}
          connected={salesforceConnected}
          connectedText="Salesforce ✅ Connected"
          connectHref="/api/auth/salesforce"
          connectLabel="Connect Salesforce"
        />
        {salesforceError && (
          <p style={{ margin: '-4px 0 0', fontSize: '12px', color: '#f87171' }}>{salesforceError}</p>
        )}

        <ConnectRow
          logo={<HubSpotLogo />}
          connected={hubspotConnected}
          connectedText="HubSpot ✅ Connected"
          connectHref="/api/auth/hubspot"
          connectLabel="Connect HubSpot"
        />
        {hubspotError && (
          <p style={{ margin: '-4px 0 0', fontSize: '12px', color: '#f87171' }}>{hubspotError}</p>
        )}
      </div>
    </div>
  )
}
