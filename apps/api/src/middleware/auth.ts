import type { NextFunction, Request, Response } from 'express';

/**
 * Автентифікація бота-воронки → платформа.
 * Очікує заголовок `Authorization: Bearer <PLATFORM_API_SECRET>`.
 */
export function requireApiSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.PLATFORM_API_SECRET;
  if (!expected) {
    res.status(500).json({ error: 'PLATFORM_API_SECRET не налаштовано на сервері' });
    return;
  }

  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;

  if (token !== expected) {
    res.status(401).json({ error: 'Невірний або відсутній токен платформи' });
    return;
  }

  next();
}
