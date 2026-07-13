'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type OutreachChannel = 'LinkedIn' | 'Email' | 'WhatsApp'

export type PendingOutreachSend = {
  contactId: string
  contactName: string
  channel: OutreachChannel
  messageText: string
}

const RETURN_DEBOUNCE_MS = 800

export function useOutreachSendConfirm(
  onConfirmed: (pending: PendingOutreachSend) => Promise<void>
) {
  const queueRef = useRef<PendingOutreachSend[]>([])
  const openedAtRef = useRef(0)
  const awaitingReturnRef = useRef(false)
  const [dialogPending, setDialogPending] = useState<PendingOutreachSend | null>(null)

  const showNextInQueue = useCallback(() => {
    const next = queueRef.current[0]
    if (!next) {
      setDialogPending(null)
      return
    }
    setDialogPending(next)
  }, [])

  const enqueuePendingSend = useCallback((item: PendingOutreachSend) => {
    queueRef.current.push(item)
    awaitingReturnRef.current = true
    openedAtRef.current = Date.now()
  }, [])

  const tryShowDialog = useCallback(() => {
    if (Date.now() - openedAtRef.current < RETURN_DEBOUNCE_MS) return
    if (!awaitingReturnRef.current || queueRef.current.length === 0) return
    if (dialogPending) return

    awaitingReturnRef.current = false
    showNextInQueue()
  }, [dialogPending, showNextInQueue])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tryShowDialog()
      }
    }

    const onFocus = () => {
      tryShowDialog()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
    }
  }, [tryShowDialog])

  const confirmSent = useCallback(async () => {
    if (!dialogPending) return

    const item = dialogPending
    queueRef.current.shift()
    setDialogPending(null)

    try {
      await onConfirmed(item)
    } catch (err) {
      console.error('Failed to confirm message sent:', err)
    }

    if (queueRef.current.length > 0) {
      setTimeout(() => showNextInQueue(), 300)
    }
  }, [dialogPending, onConfirmed, showNextInQueue])

  const dismissNotSent = useCallback(() => {
    queueRef.current.shift()
    setDialogPending(null)

    if (queueRef.current.length > 0) {
      setTimeout(() => showNextInQueue(), 300)
    }
  }, [showNextInQueue])

  return {
    dialogPending,
    enqueuePendingSend,
    confirmSent,
    dismissNotSent,
  }
}
