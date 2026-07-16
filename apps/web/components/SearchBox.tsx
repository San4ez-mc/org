'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchBox({ companyId, initialQuery }: { companyId: string; initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = value.trim();
      router.replace(q ? `/company/${companyId}/search?q=${encodeURIComponent(q)}` : `/company/${companyId}/search`);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Шукати людей, посади, процеси, інструкції…"
      style={{
        width: '100%', maxWidth: 480, background: 'hsl(var(--background))', color: 'inherit',
        border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '9px 12px', fontSize: 14,
      }}
    />
  );
}
