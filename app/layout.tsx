import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import AppShell from '@/components/layout/AppShell'
import NativeShellBridge from '@/components/native/NativeShellBridge'

// latin-ext keeps diacritics (Novák, Bureš) sharp
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  applicationName: 'ABC Card',
  title: 'ABC — Scan. Know. Connect.',
  description: 'AI Business Card — from card scan to a sent message in 10 seconds.',
  manifest: '/manifest.json',
  verification: {
    google: 'raqoKAz1vCqZjKfOF0xPMPARwyCNpP5bpphPypJGZL8',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    // The label under the home-screen icon on iOS; the manifest names it elsewhere.
    title: 'ABC Card',
  },
  /*
    Slots, not artwork. Both point at the icon the manifest already ships, so
    the favicon, the iOS home-screen icon and the installed-app icon stay one
    picture. Final brand exports replace the files at these paths.
  */
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0b',
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
    <html lang="en" className={inter.variable}>
      <head>
        {/*
          The running build, in the markup. `curl` it, or read it from a
          phone's console, and the "which version am I on" question is closed
          before anyone starts theorising about caches.
        */}
        <meta name="abc-build" content={process.env.NEXT_PUBLIC_BUILD_SHA || 'dev'} />
      </head>
      <body className="bg-abc-bg text-abc-text">
        {/* Inert on the web and in the PWA; the iOS and Android apps' integrations. */}
        <NativeShellBridge />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
