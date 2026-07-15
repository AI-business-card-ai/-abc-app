import type { Metadata, Viewport } from 'next'
import './globals.css'
import AppShell from '@/components/layout/AppShell'

export const metadata: Metadata = {
  title: 'ABC — Scan. Know. Connect.',
  description: 'AI Business Card — from card scan to a sent message in 10 seconds.',
  manifest: '/manifest.json',
  verification: {
    google: 'raqoKAz1vCqZjKfOF0xPMPARwyCNpP5bpphPypJGZL8',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ABC',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0f0f0f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-[#0d0f1a] text-[#f0f0ff]">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
