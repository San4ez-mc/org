# Жива Орг.Платформа

SaaS-платформа, що тримає орг.структуру, бізнес-процеси та посадові інструкції компанії як єдиний
живий організм. Усі зміни — через спільний Telegram-бот із ШІ. Для компаній від 5 осіб.

- Концепція та рішення: [DESIGN.md](DESIGN.md)
- План поточної фази: [PLAN_PHASE1.md](PLAN_PHASE1.md)

## Стек

Node.js + TypeScript · PostgreSQL + pgvector · Prisma · BullMQ · Google Drive/Sheets/Docs · Anthropic Claude · Vertex embeddings.

## Структура монорепо

```
apps/
  api/       Express API (контракт §8 плану)
  worker/    BullMQ: розповсюдження змін, ре-індексація, сповіщення
packages/
  db/        Prisma-клієнт + схема (pgvector)
  (далі)     ai, drive, telegram, org-template
```

## Локальний запуск (I1)

Потрібні: Node ≥18, Yarn 1.x, PostgreSQL з розширенням `vector`, Redis.

```bash
cp .env.example .env      # заповнити DATABASE_URL, REDIS_URL тощо
yarn install
yarn db:generate          # згенерувати Prisma-клієнт
yarn db:migrate           # створити схему (увімкне extension vector)
yarn dev:api              # http://localhost:4000/health
yarn dev:worker
```

## Деплой

VPS + PM2 + git-pull (за моделлю проекту «система для воронок»). Бот-воронка підключається до API платформи.
