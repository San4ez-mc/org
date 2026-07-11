'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import type { Company } from '@/lib/api';

export default function AppShell({ companies, children }: { companies: Company[]; children: ReactNode }) {
  const path = usePathname() || '/';
  if (path.startsWith('/login') || path.startsWith('/me')) return <>{children}</>;

  return (
    <>
      <TopBar companies={companies} />
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 44px)' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '24px 28px', maxWidth: 1200, overflowX: 'auto' }}>{children}</main>
      </div>
    </>
  );
}
