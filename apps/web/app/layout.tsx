import './globals.css';
import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import { getCompanies, type Company } from '@/lib/api';
import { currentAccess, visibleCompanies } from '@/lib/access';

export const metadata = {
  title: 'Жива Орг.Платформа',
  description: 'Орг.структура · процеси · посадові інструкції',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Перемикач компаній у шапці — окрема точка витоку від списку на головній:
  // layout тягне дані сам, тож фільтрувати треба і тут.
  let companies: Company[] = [];
  try {
    companies = visibleCompanies(currentAccess(), await getCompanies());
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
