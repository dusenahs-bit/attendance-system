export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '출입 관리 시스템',
  description: '행사 참가자 출입 관리 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
