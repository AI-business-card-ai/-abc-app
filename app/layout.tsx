import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ABC — Scan. Know. Connect.',
  description: 'AI Business Card — od scanu vizitky k odeslané zprávě za 10 sekund.',
  themeColor: '#07050E',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="cs">
      <body className="bg-[#07050E] text-[#F0EAFF]">
        <div className="max-w-[430px] mx-auto min-h-screen relative">
          {children}
        </div>
      </body>
    </html>
  )
}
