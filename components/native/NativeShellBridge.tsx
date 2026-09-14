'use client'

import { useEffect } from 'react'
import { isNativeApp } from '@/lib/native/runtime'

/**
 * Starts the native shell's integrations when — and only when — ABC is running
 * inside the iOS or Android app. Renders nothing.
 *
 * On the web and in the installed PWA the check fails before any Capacitor code
 * is requested, so neither pays for the native layer.
 */
export default function NativeShellBridge() {
  useEffect(() => {
    if (!isNativeApp()) return

    let stop: (() => void) | undefined
    let unmounted = false

    import('@/lib/native/shell')
      .then(({ startNativeShell }) => startNativeShell())
      .then((dispose) => {
        if (unmounted) dispose()
        else stop = dispose
      })
      .catch((err) => console.error('[native] shell failed to start:', err))

    return () => {
      unmounted = true
      stop?.()
    }
  }, [])

  return null
}
