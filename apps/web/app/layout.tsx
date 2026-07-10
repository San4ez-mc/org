import './globals.css';
import type { ReactNode } from 'react';
import Sidebar from '@/components/Sidebar';

export const metadata = {
  title: 'Жива Орг.Платформа',
  description: 'Орг.структура · процеси · посадові інструкції',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uk" className="dark">
      <body>
        {/* Тонкий верхній бар */}
        <header
          style={{
            position: 'sticky', top: 0, zIndex: 20, height: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', borderBottom: '1px solid hsl(var(--border))',
            background: 'hsl(var(--card))',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14 }}>🧬 Жива Орг.Платформа</span>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>адмін-пульт</span>
        </header>

        <div style={{ display: 'flex', minHeight: 'calc(100vh - 44px)' }}>
          <Sidebar />
          <main style={{ flex: 1, padding: '24px 28px', maxWidth: 1200, overflowX: 'auto' }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
