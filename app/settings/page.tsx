'use client'

import ErrorBoundary from '@/components/ui/ErrorBoundary'
import SettingsContent from '@/components/settings/SettingsContent'

export default function SettingsPage() {
  return (
    <ErrorBoundary>
      <SettingsContent />
    </ErrorBoundary>
  )
}
