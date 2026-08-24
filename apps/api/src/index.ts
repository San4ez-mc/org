import 'dotenv/config';
import express from 'express';
import { prisma } from '@platform/db';
import { api } from './routes';
import { ssoCatalog } from './routes/ssoCatalog';
import { mcpServer } from './routes/mcpServer';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health-чек (без авторизації) — перевіряє й зʼєднання з БД
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'down', error: String(err) });
  }
});

// Каталог для панелі доступів SSO: власна авторизація спільним секретом,
// тому монтується ДО роутера з requireApiSecret.
app.use('/api/auth/sso', ssoCatalog);

// MCP-каталог інструментів для ботів. Власна авторизація спільним секретом.
app.use('/api/mcp', mcpServer);

app.use('/api', api);

const port = Number(process.env.PORT ?? 4000);
// Слухаємо лише локально: API кличе бот-воронка з того ж сервера. Зовні не видно.
const host = process.env.API_HOST ?? '127.0.0.1';
app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] Жива Орг.Платформа слухає на ${host}:${port}`);
});
