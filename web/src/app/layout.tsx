import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { APP_NAME } from '@/lib/config'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })

export const metadata: Metadata = { title: APP_NAME }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} antialiased`}>
      <body>{children}</body>
    </html>
  )
}
