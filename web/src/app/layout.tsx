import type { Metadata } from 'next'
import { JetBrains_Mono, Literata, Plus_Jakarta_Sans } from 'next/font/google'
import { APP_NAME } from '@/lib/config'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'] })
const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'], weight: ['500', '600'] })
const literata = Literata({ variable: '--font-literata', subsets: ['latin'], weight: ['400', '600'] })

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Short lessons that adapt after every quiz.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable} ${literata.variable} antialiased`}>
      <body>{children}</body>
    </html>
  )
}
