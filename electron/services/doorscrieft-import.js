const ExcelJS = require('exceljs');

const SHEET_NAMES = ['DOORSCRIEFT', 'DOORSCRIEFT2'];
const BLOCK_SIZE = 34;
const DETAIL_ROWS = 25;
const MONTHS = [
  'JANUARI',
  'FEBRUARI',
  'MARET',
  'APRIL',
  'MEI',
  'JUNI',
  'JULI',
  'AGUSTUS',
  'SEPTEMBER',
  'OKTOBER',
  'NOVEMBER',
  'DESEMBER',
];

function cellValue(cell) {
  const value = cell?.value;
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (value.result != null) return value.result;
    if (value.text) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
    if (value.formula && value.result != null) return value.result;
  }
  return value;
}

function cellText(cell) {
  const value = cellValue(cell);
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '').trim();
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value || '')
    .replace(/Rp/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function excelSerialToDate(value) {
  const utc = new Date(Math.round((value - 25569) * 86400 * 1000));
  if (Number.isNaN(utc.getTime())) return null;
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

function withImportYear(date, fallbackYear) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  if (!fallbackYear) return date;
  return new Date(fallbackYear, date.getMonth(), date.getDate());
}

function toDateOnly(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(value, fallbackYear, fallbackMonth) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return withImportYear(value, fallbackYear);
  if (typeof value === 'number') return withImportYear(excelSerialToDate(value), fallbackYear);

  const text = String(value || '').trim();
  if (!text && fallbackYear && fallbackMonth >= 0) return new Date(fallbackYear, fallbackMonth, 1);
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return withImportYear(date, fallbackYear);

  const dayMatch = text.match(/^(\d{1,2})(?:[/-](\d{1,2})(?:[/-](\d{2,4}))?)?$/);
  if (dayMatch && fallbackYear && fallbackMonth >= 0) {
    const day = Number(dayMatch[1]);
    const month = dayMatch[2] ? Number(dayMatch[2]) - 1 : fallbackMonth;
    const year = dayMatch[3] ? Number(dayMatch[3].length === 2 ? `20${dayMatch[3]}` : dayMatch[3]) : fallbackYear;
    return new Date(year, month, day);
  }

  if (fallbackYear && fallbackMonth >= 0) return new Date(fallbackYear, fallbackMonth, 1);
  return null;
}

function normalizeKode(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function isValidKodeAnggaran(value) {
  const kode = normalizeKode(value);
  return /^(I|II)(\.[A-Z0-9]+)+\.?$/.test(kode);
}

function getBlockMonth(headerValue) {
  const upper = normalizeHeader(headerValue);
  return MONTHS.findIndex((month) => upper.includes(month));
}

function detectColumns(worksheet, rowNumber) {
  const columns = {};

  worksheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeHeader(cellText(cell));
    if (header === 'NO') columns.no = colNumber;
    else if (header.includes('BULAN') || header.includes('TANGGAL') || MONTHS.includes(header)) columns.tanggal = colNumber;
    else if (header === 'URAIAN') columns.uraian = colNumber;
    else if (header === 'KODE ANGGARAN' && !columns.kodeAnggaran) columns.kodeAnggaran = colNumber;
    else if (header === 'MATA ANGGARAN' && !columns.kodeAnggaran) columns.kodeAnggaran = colNumber;
    else if (header === 'PENERIMAAN') columns.penerimaan = colNumber;
    else if (header === 'PENGELUARAN') columns.pengeluaran = colNumber;
  });

  if (columns.no && columns.tanggal && columns.uraian && columns.kodeAnggaran && columns.penerimaan && columns.pengeluaran) {
    return columns;
  }

  return null;
}

function findHeaderRows(worksheet) {
  const headers = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const columns = detectColumns(worksheet, rowNumber);
    if (columns) {
      headers.push({ rowNumber, columns });
    }
  }
  return headers;
}

class DoorscrieftImportService {
  async import(filePath, options = {}) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = SHEET_NAMES.map((name) => workbook.getWorksheet(name)).find(Boolean);
    if (!worksheet) {
      throw new Error(`Sheet ${SHEET_NAMES.join(' atau ')} tidak ditemukan`);
    }

    const year = Number(options.year) || new Date().getFullYear();
    const rows = [];
    const lembars = [];
    const headerRows = findHeaderRows(worksheet);

    if (headerRows.length === 0) {
      throw new Error('Header DOORSCRIEFT tidak ditemukan. Pastikan sheet memakai kolom NO, TANGGAL/BULAN, URAIAN, KODE ANGGARAN, PENERIMAAN, PENGELUARAN.');
    }

    headerRows.forEach(({ rowNumber: startRow, columns }, index) => {
      const nextHeaderRow = headerRows[index + 1]?.rowNumber;
      const detailEnd = Math.min(startRow + DETAIL_ROWS, nextHeaderRow ? nextHeaderRow - 1 : startRow + BLOCK_SIZE - 1);
      const month = getBlockMonth(cellText(worksheet.getCell(startRow, columns.tanggal)));
      const sourceBlock = index + 1;
      const lembarId = `import-${Date.now().toString(36)}-${sourceBlock}`;
      let importedInBlock = 0;

      for (let rowNumber = startRow + 1; rowNumber <= detailEnd; rowNumber += 1) {
        const no = cellText(worksheet.getCell(rowNumber, columns.no));
        const tanggalRaw = cellValue(worksheet.getCell(rowNumber, columns.tanggal));
        const uraian = cellText(worksheet.getCell(rowNumber, columns.uraian));
        const kodeAnggaran = normalizeKode(cellText(worksheet.getCell(rowNumber, columns.kodeAnggaran)));
        const penerimaan = toNumber(cellValue(worksheet.getCell(rowNumber, columns.penerimaan)));
        const pengeluaran = toNumber(cellValue(worksheet.getCell(rowNumber, columns.pengeluaran)));

        if (!no && !tanggalRaw && !uraian && !kodeAnggaran && penerimaan === 0 && pengeluaran === 0) continue;
        if (!isValidKodeAnggaran(kodeAnggaran)) continue;
        if (!uraian && penerimaan === 0 && pengeluaran === 0) continue;

        const tanggal = parseDate(tanggalRaw, year, month);
        rows.push({
          no,
          tanggal: toDateOnly(tanggal || new Date(year, Math.max(month, 0), 1)),
          uraian,
          kodeAnggaran,
          mataAnggaran: '',
          penerimaan,
          pengeluaran,
          lembarId,
          bulan: month >= 0 ? month : undefined,
          sourceBlock,
          sourceRow: rowNumber,
        });
        importedInBlock += 1;
      }

      if (importedInBlock > 0) {
        lembars.push({ lembarId, month });
      }
    });

    return { rows, lembars };
  }
}

module.exports = { DoorscrieftImportService };
