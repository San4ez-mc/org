import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';

// Ініціація входу через FINEKO SSO (#284):
// генеруємо state, кладемо в cookie, редіректимо на /authorize.
export async function GET() {
  const sso = process.env.SSO_URL ?? 'http://localhost:4600';
  const base = process.env.ORG_BASE_URL ?? 'http://localhost:4300';
  const clientId = process.env.ORG_SSO_CLIENT_ID ?? '';
  const state = randomBytes(16).toString('hex');

  cookies().set('sso_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 хв
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${base}/auth/sso/callback`,
    response_type: 'code',
    state,
  });
  return NextResponse.redirect(`${sso}/authorize?${params.toString()}`);
}
