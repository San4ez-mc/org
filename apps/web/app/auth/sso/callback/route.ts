import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Callback SSO (#284): перевіряємо state, міняємо code→token,
// і — за успіху — ставимо сесійний cookie ОРГ (той самий механізм, що й пароль).
export async function GET(req: NextRequest) {
  const sso = process.env.SSO_URL ?? 'http://localhost:4600';
  const base = process.env.ORG_BASE_URL ?? 'http://localhost:4300';
  const clientId = process.env.ORG_SSO_CLIENT_ID ?? '';
  const clientSecret = process.env.ORG_SSO_CLIENT_SECRET ?? '';

  const url = new URL(req.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const savedState = cookies().get('sso_state')?.value ?? '';

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${base}/login?e=sso`);
  }

  try {
    const tokenRes = await fetch(`${sso}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${base}/auth/sso/callback`,
      }),
      cache: 'no-store',
    });
    if (!tokenRes.ok) return NextResponse.redirect(`${base}/login?e=sso`);
    const data = (await tokenRes.json()) as { user?: { email?: string; name?: string } };

    const res = NextResponse.redirect(`${base}/`);
    // Той самий сесійний токен, що й вхід за паролем — middleware пропустить.
    res.cookies.set('org_session', process.env.AUTH_TOKEN ?? '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    // Хто увійшов (для відображення; не для доступу — доступ дає org_session).
    if (data.user?.email) {
      res.cookies.set('org_user', data.user.email, {
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    res.cookies.set('sso_state', '', { path: '/', maxAge: 0 });
    return res;
  } catch {
    return NextResponse.redirect(`${base}/login?e=sso`);
  }
}
