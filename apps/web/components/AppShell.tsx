'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import type { Company } from '@/lib/api';

export default function AppShell({
  companies,
  children,
  user,
  isSuperadmin,
}: {
  companies: Company[];
  children: ReactNode;
  user?: { name: string; email: string } | null;
  isSuperadmin?: boolean;
}) {
  const path = usePathname() || '/';
  if (path.startsWith('/login') || path.startsWith('/me')) return <>{children}</>;

  return (
    <>
      <TopBar companies={companies} user={user} />
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 44px)' }}>
        <Sidebar isSuperadmin={isSuperadmin} />
        <main style={{ flex: 1, minWidth: 0, padding: '10px 24px', overflowX: 'auto' }}>{children}</main>
      </div>
    </>
  );
}
