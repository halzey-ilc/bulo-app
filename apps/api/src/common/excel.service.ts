import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  /** money | qty | text */
  kind?: 'money' | 'qty' | 'text';
}

export interface ExcelSheet {
  name: string;
  /** Строки над таблицей: заголовок документа, реквизиты */
  heading?: string[];
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
  /** Итоговая строка: значения по ключам колонок */
  totals?: Record<string, unknown>;
}

const MANGO = 'FFE94F15';
const OAT = 'FFF9F5E6';

/** Excel-выгрузки в одном оформлении BULO. */
@Injectable()
export class ExcelService {
  async build(sheets: ExcelSheet[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'BULO';
    for (const s of sheets) this.addSheet(wb, s);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private addSheet(wb: ExcelJS.Workbook, s: ExcelSheet) {
    // Excel запрещает некоторые символы и длину > 31 в имени листа
    const name = s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Лист';
    const ws = wb.addWorksheet(name);
    let row = 1;
    for (const [i, line] of (s.heading ?? []).entries()) {
      const r = ws.getRow(row++);
      r.getCell(1).value = line;
      r.getCell(1).font = i === 0 ? { bold: true, size: 14, color: { argb: MANGO } } : { size: 11 };
    }
    if (s.heading?.length) row++;

    const header = ws.getRow(row++);
    s.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MANGO } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      ws.getColumn(i + 1).width = c.width ?? 16;
    });

    const write = (values: Record<string, unknown>, bold = false) => {
      const r = ws.getRow(row++);
      s.columns.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        const v = values[c.key];
        cell.value = c.kind && c.kind !== 'text' && v != null && v !== '' ? Number(v) : (v as ExcelJS.CellValue) ?? '';
        if (c.kind === 'money') cell.numFmt = '#,##0.00';
        if (c.kind === 'qty') cell.numFmt = '#,##0.###';
        if (bold) {
          cell.font = { bold: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OAT } };
        }
      });
    };
    s.rows.forEach((r) => write(r));
    if (s.totals) write(s.totals, true);
  }
}
