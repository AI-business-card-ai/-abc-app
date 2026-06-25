'use client'

import React from 'react'

type Props = {
  children: React.ReactNode
  fallback?: React.ReactNode
  onReset?: () => void
}

type State = {
  hasError: boolean
  message: string
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Something went wrong.' }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: '' })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
          style={{ background: '#0d0f1a', color: '#f0f0ff' }}
        >
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="text-sm max-w-sm" style={{ color: '#8892b0' }}>
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="glow-btn rounded-xl px-6 py-3 font-semibold min-h-[44px]"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
