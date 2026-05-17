import type { Metadata } from 'next'

import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { Inter, Geist_Mono, Bebas_Neue } from 'next/font/google'

// Initialize fonts
const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-inter',
  weight: ["400", "500", "600", "700"] 
})
const geistMono = Geist_Mono({ 
  subsets: ['latin'], 
  variable: '--font-geist-mono',
  weight: ["400", "500", "600", "700"] 
})
const bebasNeue = Bebas_Neue({ 
  subsets: ['latin'], 
  variable: '--font-bebas-neue',
  weight: ["400"] 
})

export const metadata: Metadata = {
  title: 'Cypher Net | Breaking Rankings & Community',
  description: 'The official ranking system for the Greater Vancouver breaking community. Track battles, view leaderboards, and celebrate the culture.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} ${bebasNeue.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
