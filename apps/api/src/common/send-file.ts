import type { Response } from 'express';

/** Отдаёт Excel-файл на скачивание. */
export function sendFile(res: Response, file: { filename: string; buffer: Buffer }) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  res.send(file.buffer);
}
