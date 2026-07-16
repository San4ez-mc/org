/**
 * Отримання аватарки працівника з Telegram (getUserProfilePhotos → getFile → бінарник).
 * Той самий TELEGRAM_BOT_TOKEN, що й для sendMessage (apps/api/src/services/agent.ts).
 */
export interface TelegramPhoto {
  data: Buffer;
  mime: string;
}

export async function fetchTelegramProfilePhoto(telegramUserId: string): Promise<TelegramPhoto | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  const photosRes = await fetch(
    `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${encodeURIComponent(telegramUserId)}&limit=1`,
  );
  const photosJson = (await photosRes.json()) as {
    ok?: boolean;
    result?: { photos?: { file_id: string }[][] };
  };
  const sizes = photosJson?.result?.photos?.[0];
  if (!photosJson?.ok || !Array.isArray(sizes) || !sizes.length) return null;

  const largest = sizes[sizes.length - 1]; // Telegram повертає розміри за зростанням
  const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${largest.file_id}`);
  const fileJson = (await fileRes.json()) as { ok?: boolean; result?: { file_path?: string } };
  const filePath = fileJson?.result?.file_path;
  if (!fileJson?.ok || !filePath) return null;

  const imgRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!imgRes.ok) return null;
  const data = Buffer.from(await imgRes.arrayBuffer());
  const mime = filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  return { data, mime };
}
