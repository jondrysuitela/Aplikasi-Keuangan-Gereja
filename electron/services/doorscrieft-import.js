const path = require('path');
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

  const dayMonthYearMatch = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dayMonthYearMatch) {
    const day = Number(dayMonthYearMatch[1]);
    const month = Number(dayMonthYearMatch[2]) - 1;
    let year = Number(dayMonthYearMatch[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) return withImportYear(date, fallbackYear);
  }

  const dayMonthMatch = text.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (dayMonthMatch && fallbackYear && fallbackMonth >= 0) {
    const day = Number(dayMonthMatch[1]);
    const month = Number(dayMonthMatch[2]) - 1;
    const date = new Date(fallbackYear, month, day);
    if (!Number.isNaN(date.getTime())) return withImportYear(date, fallbackYear);
  }

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return withImportYear(date, fallbackYear);

  if (fallbackYear && fallbackMonth >= 0) return new Date(fallbackYear, fallbackMonth, 1);
  return null;
}

function normalizeKode(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\.+$/, '')
    .toUpperCase();
}

function isValidKodeAnggaran(value) {
  const kode = normalizeKode(value);
  return /^(I|II)(\.[A-Z0-9]+)+$/.test(kode);
}

function isKodeFound(value, validCodes = []) {
  const kode = normalizeKode(value);
  return validCodes.some((item) => normalizeKode(item) === kode);
}

function parseAmount(value) {
  const raw = String(value ?? '').trim();
  const number = toNumber(value);
  const cleaned = String(raw)
    .replace(/Rp/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');

  const invalid = raw !== '' && cleaned !== '' && Number.isNaN(Number(cleaned));
  return { value: Number.isFinite(number) ? number : 0, raw, invalid };
}

function getRowFingerprint(row) {
  return [row.tanggal || '', normalizeKode(row.kodeAnggaran), row.penerimaan, row.pengeluaran, String(row.uraian || '').toLowerCase().trim()].join('||');
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
  async preview(filePath, options = {}) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    const worksheet = SHEET_NAMES.map((name) => workbook.getWorksheet(name)).find(Boolean);
    if (!worksheet) {
      throw new Error(`Sheet ${SHEET_NAMES.join(' atau ')} tidak ditemukan`);
    }

    const year = Number(options.year) || new Date().getFullYear();
    const validCodes = Array.isArray(options.validCodes) ? options.validCodes : [];
    const headerRows = findHeaderRows(worksheet);

    if (headerRows.length === 0) {
      throw new Error('Header DOORSCRIEFT tidak ditemukan. Pastikan sheet memakai kolom NO, TANGGAL/BULAN, URAIAN, KODE ANGGARAN, PENERIMAAN, PENGELUARAN.');
    }

    const parsedRows = [];
    const months = new Set();
    let emptyRows = 0;
    let totalNominal = 0;

    headerRows.forEach(({ rowNumber: startRow, columns }, index) => {
      const nextHeaderRow = headerRows[index + 1]?.rowNumber;
      const detailEnd = Math.min(startRow + DETAIL_ROWS, nextHeaderRow ? nextHeaderRow - 1 : startRow + BLOCK_SIZE - 1);
      const month = getBlockMonth(cellText(worksheet.getCell(startRow, columns.tanggal)));
      const sourceBlock = index + 1;
      const lembarId = `import-${Date.now().toString(36)}-${sourceBlock}`;

      if (month >= 0) {
        months.add(MONTHS[month]);
      }

      for (let rowNumber = startRow + 1; rowNumber <= detailEnd; rowNumber += 1) {
        const no = cellText(worksheet.getCell(rowNumber, columns.no));
        const tanggalRaw = cellValue(worksheet.getCell(rowNumber, columns.tanggal));
        const uraian = cellText(worksheet.getCell(rowNumber, columns.uraian));
        const kodeAnggaranRaw = cellText(worksheet.getCell(rowNumber, columns.kodeAnggaran));
        const kodeAnggaran = normalizeKode(kodeAnggaranRaw);
        const penerimaanParsed = parseAmount(cellValue(worksheet.getCell(rowNumber, columns.penerimaan)));
        const pengeluaranParsed = parseAmount(cellValue(worksheet.getCell(rowNumber, columns.pengeluaran)));
        const isBlankRow = !no && !tanggalRaw && !uraian && !kodeAnggaran && penerimaanParsed.value === 0 && pengeluaranParsed.value === 0;

        if (isBlankRow) {
          emptyRows += 1;
          continue;
        }

        const rowWarnings = [];
        const rowErrors = [];

        const tanggal = parseDate(tanggalRaw, year, month);
        if (tanggalRaw && !tanggal) {
          rowErrors.push('Format tanggal tidak valid');
        }
        if (!kodeAnggaranRaw) {
          rowErrors.push('Kolom Kode Anggaran kosong');
        } else if (!isValidKodeAnggaran(kodeAnggaran)) {
          rowErrors.push(`Format kode anggaran tidak valid: ${kodeAnggaranRaw}`);
        } else if (validCodes.length > 0 && !isKodeFound(kodeAnggaran, validCodes)) {
          rowErrors.push(`Kode anggaran tidak ditemukan: ${kodeAnggaranRaw}`);
        }
        if (!uraian) {
          rowErrors.push('Kolom Uraian kosong');
        }
        if (penerimaanParsed.invalid || pengeluaranParsed.invalid) {
          rowErrors.push('Format nominal tidak valid');
        }
        if (penerimaanParsed.value < 0 || pengeluaranParsed.value < 0) {
          rowErrors.push('Nominal negatif ditemukan');
        }
        if (penerimaanParsed.value === 0 && pengeluaranParsed.value === 0) {
          rowWarnings.push('Nominal kosong atau nol');
        }
        if (tanggal && tanggal.getFullYear() !== year) {
          rowWarnings.push(`Tanggal ${(tanggalRaw instanceof Date ? tanggalRaw.toLocaleDateString('id-ID') : String(tanggalRaw || '')).trim()} berada di tahun ${tanggal.getFullYear()}, bukan tahun aktif ${year}`);
        }

        const parsedRow = {
          rowNumber,
          no,
          tanggal: tanggal ? toDateOnly(tanggal) : '',
          tanggalRaw: tanggalRaw instanceof Date ? toDateOnly(tanggalRaw) : String(tanggalRaw || '').trim(),
          uraian,
          kodeAnggaran,
          mataAnggaran: '',
          penerimaan: penerimaanParsed.value,
          pengeluaran: pengeluaranParsed.value,
          lembarId,
          bulan: month >= 0 ? month : undefined,
          sourceBlock,
          sourceRow: rowNumber,
          warnings: rowWarnings,
          errors: rowErrors,
          fingerprint: getRowFingerprint({ tanggal: tanggal ? toDateOnly(tanggal) : '', kodeAnggaran, uraian, penerimaan: penerimaanParsed.value, pengeluaran: pengeluaranParsed.value }),
        };

        parsedRows.push(parsedRow);
      }
    });

    const fingerprintCount = parsedRows.reduce((acc, row) => {
      acc[row.fingerprint] = (acc[row.fingerprint] || 0) + 1;
      return acc;
    }, {});

    const duplicateRows = parsedRows.filter((row) => fingerprintCount[row.fingerprint] > 1).map((row) => ({ ...row, duplicate: true }));
    const validRows = parsedRows.filter((row) => row.errors.length === 0 && fingerprintCount[row.fingerprint] === 1);

    validRows.forEach((row) => {
      totalNominal += Math.abs(row.penerimaan) + Math.abs(row.pengeluaran);
    });

    const summaryWarnings = Array.from(
      new Set(
        parsedRows.reduce((acc, row) => acc.concat(row.warnings || []), [])
      )
    );
    const summaryErrors = Array.from(
      new Set(
        parsedRows.reduce((acc, row) => acc.concat(row.errors || []), [])
      )
    );

    return {
      fileName: path.basename(filePath),
      filePath,
      sheetCount: sheetNames.length,
      sheetNames,
      detectedSheetName: worksheet.name,
      detectedMonths: Array.from(months),
      totalRows: parsedRows.length,
      validRows: validRows.length,
      invalidRows: parsedRows.filter((row) => row.errors.length > 0).length,
      duplicateRows: duplicateRows.length,
      emptyRows,
      totalNominal,
      warnings: summaryWarnings,
      errors: summaryErrors,
      rows: validRows.map((row) => ({
        no: row.no,
        tanggal: row.tanggal,
        uraian: row.uraian,
        kodeAnggaran: row.kodeAnggaran,
        mataAnggaran: row.mataAnggaran,
        penerimaan: row.penerimaan,
        pengeluaran: row.pengeluaran,
        lembarId: row.lembarId,
        bulan: row.bulan,
      })),
      parsedRows: parsedRows.slice(0, 20),
      duplicateRowsSample: duplicateRows.slice(0, 20),
    };
  }

  async import(filePath, options = {}) {
    const previewResult = await this.preview(filePath, options);
    return { rows: previewResult.rows, summary: previewResult };
  }
}

module.exports = { DoorscrieftImportService };
