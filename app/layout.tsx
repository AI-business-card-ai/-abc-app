import type { Metadata, Viewport } from 'next'
import './globals.css'
import AppShell from '@/components/layout/AppShell'

export const metadata: Metadata = {
  title: 'ABC — Scan. Know. Connect.',
  description: 'AI Business Card — from card scan to a sent message in 10 seconds.',
}

export const viewport: Viewport = {
  themeColor: '#07050E',
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
      <body className="bg-[#0a0a0f] text-[#F0EAFF]">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
