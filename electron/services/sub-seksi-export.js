const ExcelJS = require('exceljs');
const fs = require('fs');

const TEMPLATE_SHEET_NAME = 'SUB SEKSI';
const START_ROW = 10;
const END_ROW = 54;
const TOTAL_ROW = 55;

function cellToString(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value.text) return String(value.text).trim();
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('').trim();
    if (value.result != null) return String(value.result).trim();
    if (value.formula) return String(value.result || '').trim();
  }
  return String(value).trim();
}

function normalizeKode(value) {
  return cellToString(value).replace(/\s+/g, '').toUpperCase();
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isParentCode(kode, allCodes) {
  return allCodes.some((candidate) => candidate !== kode && candidate.startsWith(`${kode}.`));
}

function getCellFormula(cell) {
  if (cell.formula) return cell.formula;
  if (cell.value && typeof cell.value === 'object' && cell.value.formula) return cell.value.formula;
  return '';
}

function matchesKode(transactionKode, templateKode, includeChildren) {
  if (!transactionKode || !templateKode) return false;
  if (transactionKode === templateKode) return true;
  return includeChildren && transactionKode.startsWith(`${templateKode}.`);
}

function pairedKodeForJenis(templateKode, jenis) {
  if (!templateKode) return '';
  if (jenis === 'pengeluaran' && templateKode.startsWith('I.')) return `II.${templateKode.slice(2)}`;
  if (jenis === 'pendapatan' && templateKode.startsWith('II.')) return `I.${templateKode.slice(3)}`;
  return templateKode;
}

function matchesKodeForJenis(transactionKode, templateKode, includeChildren, jenis) {
  const pairedKode = pairedKodeForJenis(templateKode, jenis);
  return (
    matchesKode(transactionKode, templateKode, includeChildren) ||
    matchesKode(transactionKode, pairedKode, includeChildren)
  );
}

class SubSeksiExportService {
  constructor({ templatePath, databasePath } = {}) {
    this.templatePath = templatePath;
    this.databasePath = databasePath;
  }

  async export(config = {}) {
    if (!this.templatePath) {
      throw new Error('Path template MAPPING.xlsx belum diset');
    }

    const tahun = Number(config.tahun) || new Date().getFullYear();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.templatePath);

    const worksheet = workbook.getWorksheet(TEMPLATE_SHEET_NAME);
    if (!worksheet) {
      throw new Error(`Sheet ${TEMPLATE_SHEET_NAME} tidak ditemukan di MAPPING.xlsx`);
    }

    for (const sheet of [...workbook.worksheets]) {
      if (sheet.name !== TEMPLATE_SHEET_NAME) workbook.removeWorksheet(sheet.id);
    }

    this._fillWorksheet(worksheet, config.doorscrieftTransaksis || [], tahun);

    workbook.creator = 'Keuangan Gereja';
    workbook.lastModifiedBy = 'Keuangan Gereja';
    workbook.created = new Date();
    workbook.modified = new Date();

    return workbook.xlsx.writeBuffer();
  }

  _fillWorksheet(worksheet, transaksis, tahun) {
    worksheet.name = TEMPLATE_SHEET_NAME;
    worksheet.pageSetup = {
      ...worksheet.pageSetup,
      printArea: 'A1:J55',
    };
    if (!worksheet.views || worksheet.views.length === 0) {
      worksheet.views = [{ state: 'frozen', ySplit: 9, topLeftCell: 'A10', showGridLines: false }];
    }

    const database = this._loadDatabase(worksheet);
    const databaseRows = database.rows.filter((row) => row.row >= START_ROW && row.row <= END_ROW);
    const mappingCodes = databaseRows.map((row) => normalizeKode(row.kode)).filter(Boolean);

    const rows = Array.isArray(transaksis) ? transaksis : [];
    const formulaMap = {};
    for (let rowNumber = START_ROW; rowNumber <= END_ROW; rowNumber += 1) {
      for (const column of ['F', 'I']) {
        formulaMap[`${column}${rowNumber}`] = getCellFormula(worksheet.getCell(`${column}${rowNumber}`));
      }
    }
    for (const column of ['D', 'E', 'F', 'G', 'H', 'I']) {
      formulaMap[`${column}${TOTAL_ROW}`] = getCellFormula(worksheet.getCell(`${column}${TOTAL_ROW}`));
    }

    for (const databaseRow of databaseRows) {
      const rowNumber = databaseRow.row;
      const kode = normalizeKode(databaseRow.kode);
      const isParent = isParentCode(kode, mappingCodes);
      const totals = isParent
        ? {
            pendapatanSemester1: 0,
            pendapatanSemester2: 0,
            pengeluaranSemester1: 0,
            pengeluaranSemester2: 0,
          }
        : this._calculateTotals(rows, kode, tahun, false);
      const pendapatanTotal = totals.pendapatanSemester1 + totals.pendapatanSemester2;
      const pengeluaranTotal = totals.pengeluaranSemester1 + totals.pengeluaranSemester2;
      const formulaPendapatan = databaseRow.formulaPendapatan || formulaMap[`F${rowNumber}`];
      const formulaPengeluaran = databaseRow.formulaPengeluaran || formulaMap[`I${rowNumber}`];

      worksheet.getCell(`A${rowNumber}`).value = databaseRow.no;
      worksheet.getCell(`B${rowNumber}`).value = databaseRow.kode;
      worksheet.getCell(`C${rowNumber}`).value = databaseRow.mataAnggaran;
      worksheet.getCell(`D${rowNumber}`).value = isParent ? null : totals.pendapatanSemester1;
      worksheet.getCell(`E${rowNumber}`).value = isParent ? null : totals.pendapatanSemester2;
      worksheet.getCell(`F${rowNumber}`).value = !isParent && formulaPendapatan
        ? { formula: formulaPendapatan, result: pendapatanTotal }
        : null;
      worksheet.getCell(`G${rowNumber}`).value = isParent ? null : totals.pengeluaranSemester1;
      worksheet.getCell(`H${rowNumber}`).value = isParent ? null : totals.pengeluaranSemester2;
      worksheet.getCell(`I${rowNumber}`).value = !isParent && formulaPengeluaran
        ? { formula: formulaPengeluaran, result: pengeluaranTotal }
        : null;
      worksheet.getCell(`J${rowNumber}`).value = worksheet.getCell(`J${rowNumber}`).value || '';
    }

    for (const column of ['D', 'E', 'F', 'G', 'H', 'I']) {
      const address = `${column}${TOTAL_ROW}`;
      const formula = database.total?.formulas?.[column] || formulaMap[address];
      worksheet.getCell(address).value = formula
        ? { formula }
        : worksheet.getCell(address).value;
    }
  }

  _loadDatabase(worksheet) {
    if (this.databasePath && fs.existsSync(this.databasePath)) {
      const raw = fs.readFileSync(this.databasePath, 'utf-8');
      const database = JSON.parse(raw);
      if (Array.isArray(database.rows) && database.rows.length > 0) {
        return database;
      }
    }

    const rows = [];
    for (let rowNumber = START_ROW; rowNumber <= END_ROW; rowNumber += 1) {
      rows.push({
        row: rowNumber,
        no: worksheet.getCell(`A${rowNumber}`).value || '',
        kode: cellToString(worksheet.getCell(`B${rowNumber}`).value),
        mataAnggaran: cellToString(worksheet.getCell(`C${rowNumber}`).value),
        formulaPendapatan: getCellFormula(worksheet.getCell(`F${rowNumber}`)),
        formulaPengeluaran: getCellFormula(worksheet.getCell(`I${rowNumber}`)),
      });
    }

    return {
      sheetName: TEMPLATE_SHEET_NAME,
      range: 'A1:J55',
      rows,
      total: {
        row: TOTAL_ROW,
        formulas: {
          D: getCellFormula(worksheet.getCell(`D${TOTAL_ROW}`)),
          E: getCellFormula(worksheet.getCell(`E${TOTAL_ROW}`)),
          F: getCellFormula(worksheet.getCell(`F${TOTAL_ROW}`)),
          G: getCellFormula(worksheet.getCell(`G${TOTAL_ROW}`)),
          H: getCellFormula(worksheet.getCell(`H${TOTAL_ROW}`)),
          I: getCellFormula(worksheet.getCell(`I${TOTAL_ROW}`)),
        },
      },
    };
  }

  _calculateTotals(rows, kode, tahun, includeChildren) {
    const totals = {
      pendapatanSemester1: 0,
      pendapatanSemester2: 0,
      pengeluaranSemester1: 0,
      pengeluaranSemester2: 0,
    };

    for (const row of rows) {
      const tanggal = parseDate(row.tanggal);
      if (!tanggal || tanggal.getFullYear() !== tahun) continue;

      const transactionKode = normalizeKode(row.kodeAnggaran);
      const semesterKey = tanggal.getMonth() < 6 ? 'Semester1' : 'Semester2';
      if (matchesKodeForJenis(transactionKode, kode, includeChildren, 'pendapatan')) {
        totals[`pendapatan${semesterKey}`] += toNumber(row.penerimaan);
      }
      if (matchesKodeForJenis(transactionKode, kode, includeChildren, 'pengeluaran')) {
        totals[`pengeluaran${semesterKey}`] += toNumber(row.pengeluaran);
      }
    }

    return totals;
  }
}

module.exports = { SubSeksiExportService, TEMPLATE_SHEET_NAME };
