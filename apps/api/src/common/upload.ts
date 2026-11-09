import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

export const UPLOAD_DIR = join(process.cwd(), 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

/** Загрузка картинки (фото товара, история, чек об оплате): JPG, PNG или WebP до 8 МБ. */
export const photoUpload = FileInterceptor('file', {
  storage: diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase() || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});

export const publicUrl = (file: string) => `${process.env.PUBLIC_URL ?? ''}/uploads/${file}`;
