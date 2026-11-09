import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

export const UPLOAD_DIR = join(process.cwd(), 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * Расширение файла берём по типу картинки, а не из имени, которое прислал телефон:
 * иначе под видом «фото чека» можно положить на сервер HTML-страницу.
 */
const EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/** Загрузка картинки (фото товара, история, чек об оплате): JPG, PNG или WebP до 8 МБ. */
export const photoUpload = FileInterceptor('file', {
  storage: diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${EXT[file.mimetype] ?? '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in EXT),
});

export const publicUrl = (file: string) => `${process.env.PUBLIC_URL ?? ''}/uploads/${file}`;
