import type { Metadata } from 'next'
import { IBM_Plex_Mono, Barlow } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-mono',
  display: 'swap',
})

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HeadlessERP — Autonomous Agent Operations',
  description:
    'AI-agent-driven headless enterprise resource planning system on Supabase',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexMono.variable} ${barlow.variable}`}
      style={{ height: '100%' }}
    >
      <body style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
        <Sidebar />
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {children}
        </main>
      </body>
    </html>
  )
}
