import './globals.css';
import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import { getCompanies, type Company } from '@/lib/api';

export const metadata = {
  title: 'Жива Орг.Платформа',
  description: 'Орг.структура · процеси · посадові інструкції',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  let companies: Company[] = [];
  try {
    companies = await getCompanies();
  } catch {
    companies = [];
  }

  return (
    <html lang="uk" className="dark">
      <body>
        <AppShell companies={companies}>{children}</AppShell>
      </body>
    </html>
  );
}
