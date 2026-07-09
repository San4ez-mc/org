import 'dotenv/config';
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { makeOAuthClient, OAUTH_SCOPES, TOKEN_FILE } from '@platform/drive';

/**
 * Одноразова OAuth-авторизація: відкриваєш URL → даєш згоду → скрипт зберігає refresh token.
 * Потім платформа створює Google-файли від твого імені (на твоєму диску).
 *
 * Запуск: yarn auth:google
 */
async function main() {
  const oauth = makeOAuthClient();
  const url = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: OAUTH_SCOPES,
  });

  const redirect = new URL(process.env.GOOGLE_OAUTH_REDIRECT_URI ?? 'http://localhost:4123/oauth2callback');
  const port = Number(redirect.port || 4123);

  console.log('\n1) Відкрий це посилання у браузері (де ти залогінений як власник папки):\n');
  console.log(url + '\n');
  console.log(`2) Дай згоду. Після цього повернешся на ${redirect.origin} — токен збережеться автоматично.\n`);

  const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith(redirect.pathname)) {
      res.writeHead(404).end();
      return;
    }
    const code = new URL(req.url, redirect.origin).searchParams.get('code');
    if (!code) {
      res.writeHead(400).end('Немає code у запиті');
      return;
    }
    try {
      const { tokens } = await oauth.getToken(code);
      if (!tokens.refresh_token) {
        throw new Error('Google не повернув refresh_token. Прибери доступ у myaccount.google.com і спробуй ще (потрібен prompt=consent).');
      }
      mkdirSync(dirname(TOKEN_FILE), { recursive: true });
      writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>Готово ✅ Можна закрити вкладку і повернутись у термінал.</h2>');
      console.log('Refresh token збережено у', TOKEN_FILE);
      console.log('Готово ✅ — тепер запусти: yarn create:company "Назва"');
      setTimeout(() => server.close(() => process.exit(0)), 500);
    } catch (err: any) {
      res.writeHead(500).end('Помилка: ' + err.message);
      console.error('Помилка обміну коду:', err.message);
      server.close(() => process.exit(1));
    }
  });

  server.listen(port, () => console.log(`(очікую редірект на ${redirect.origin}${redirect.pathname} …)`));
}

main().catch((err) => {
  console.error('Помилка:', err?.message ?? err);
  process.exit(1);
});
