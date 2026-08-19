import './globals.css'
import type { ReactNode } from 'react'

export const metadata = { title: 'PostDeck' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><div className="wrap">{children}</div></body>
    </html>
  )
}
