// Проксі до API-сервера, який слухає лише localhost (не видно ззовні).
// Дає стабільний публічний шлях /photo/<memberId> для <img src>.
const BASE = process.env.ORG_API_URL ?? 'http://127.0.0.1:4100/api';
const TOKEN = process.env.ORG_API_TOKEN ?? '';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const res = await fetch(`${BASE}/members/${params.id}/photo`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) return new Response(null, { status: res.status });
  const buf = await res.arrayBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
