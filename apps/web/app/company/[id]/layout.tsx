import { notFound } from 'next/navigation';
import { canSeeCompany, currentAccess } from '@/lib/access';

/**
 * Один гард на всі сторінки компанії — картка, структура, процеси, папка, журнал тощо.
 *
 * Layout у App Router обгортає весь вкладений сегмент, тож перевірка тут закриває
 * і майбутні сторінки, які хтось додасть, не згадавши про доступи. Фільтрації списку
 * на головній недостатньо: адресу `/company/<id>` можна набрати руками.
 *
 * Віддаємо 404, а не 403: інакше сама відповідь підтверджувала б, що компанія з таким
 * id існує, і чужий перелік можна було б відновити перебором.
 */
export default function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  if (!canSeeCompany(currentAccess(), params.id)) notFound();
  return <>{children}</>;
}
