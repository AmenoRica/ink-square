import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://ink-square.nice-moon-6673.chatgpt.site'),
  title: '잉크 광장 — 익명 음성 채팅',
  description: '무작위 잉크 문자와 캐릭터 목소리로 만나는 P2P 익명 음성 채팅',
  openGraph: {
    title: '잉크 광장',
    description: '기록 없이 만나는 P2P 익명 음성 채팅',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: '잉크 광장',
    description: '기록 없이 만나는 P2P 익명 음성 채팅',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
