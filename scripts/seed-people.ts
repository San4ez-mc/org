import 'dotenv/config';
import { prisma } from '@platform/db';

/**
 * Генерує N вигаданих працівників з українськими іменами і розподіляє по посадах.
 * Запуск на сервері: yarn tsx scripts/seed-people.ts <companyId> <count>
 */
const FIRST = [
  'Олександр', 'Іван', 'Дмитро', 'Андрій', 'Сергій', 'Максим', 'Артем', 'Володимир', 'Микола', 'Юрій',
  'Тарас', 'Богдан', 'Василь', 'Роман', 'Павло', 'Олег', 'Ігор', 'Віктор', 'Денис', 'Назар',
  'Олена', 'Ірина', 'Наталія', 'Марія', 'Тетяна', 'Оксана', 'Юлія', 'Анна', 'Катерина', 'Софія',
  'Вікторія', 'Людмила', 'Галина', 'Світлана', 'Дарина', 'Аліна', 'Христина', 'Валентина', 'Ольга', 'Інна',
];
const LAST = [
  'Шевченко', 'Коваленко', 'Бондаренко', 'Ткаченко', 'Кравченко', 'Мельник', 'Ковальчук', 'Бойко', 'Поліщук', 'Іваненко',
  'Мороз', 'Лисенко', 'Марченко', 'Савченко', 'Пономаренко', 'Гончаренко', 'Ткачук', 'Руденко', 'Клименко', 'Павленко',
  'Петренко', 'Захарченко', 'Кузьменко', 'Левченко', 'Мельниченко', 'Оніщенко', 'Романенко', 'Сидоренко', 'Тимошенко', 'Юрченко',
];
const rand = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

async function main() {
  const [companyId, countStr] = process.argv.slice(2);
  const count = Number(countStr || 200);
  if (!companyId) throw new Error('yarn tsx scripts/seed-people.ts <companyId> <count>');

  const posts = await prisma.orgUnit.findMany({ where: { companyId, type: 'POST' }, select: { id: true } });
  if (!posts.length) throw new Error('У компанії немає посад');

  let created = 0;
  for (let i = 0; i < count; i++) {
    const first = rand(FIRST);
    const last = rand(LAST);
    const nPosts = Math.random() < 0.2 ? 2 : 1; // 20% мають дві посади
    const assigned = new Set<string>();
    while (assigned.size < nPosts) assigned.add(rand(posts).id);
    await prisma.member.create({
      data: {
        companyId,
        firstName: first,
        lastName: last,
        telegramUsername: `user${i + 1}`,
        posts: { create: [...assigned].map((pid) => ({ postUnitId: pid })) },
      },
    });
    created++;
  }
  console.log(`Готово ✅ Додано працівників: ${created}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Помилка:', e?.message ?? e);
  process.exit(1);
});
