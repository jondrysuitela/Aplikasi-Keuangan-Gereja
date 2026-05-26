const ExcelJS = require('exceljs');

const TEMPLATE_SHEET_NAME = 'DOORSCRIEFT';
const BLOCK_SIZE = 34;
const DETAIL_ROWS = 25;
const VISIBLE_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F'];
const SOURCE_COLUMNS = ['B', 'C', 'D', 'E', 'F', 'G'];
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
const CURRENCY_FORMAT = '_-"Rp"* #,##0_-;-"Rp"* #,##0_-;_-"Rp"* "-"_-;_-@_-';

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeKode(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getMonthName(lembar, rows) {
  if (lembar.monthName) return String(lembar.monthName).toUpperCase();
  if (Number.isInteger(lembar.bulan)) return MONTHS[lembar.bulan] || 'BULAN';

  const firstDate = rows.map((row) => parseDate(row.tanggal)).find(Boolean);
  return firstDate ? MONTHS[firstDate.getMonth()] : 'BULAN';
}

class DoorscrieftExportService {
  constructor({ templatePath } = {}) {
    this.templatePath = templatePath;
  }

  async export(config = {}) {
    if (!this.templatePath) {
      throw new Error('Path template MAPPING.xlsx belum diset');
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.templatePath);
    const templateSheet = workbook.getWorksheet(TEMPLATE_SHEET_NAME);
    if (!templateSheet) {
      throw new Error(`Sheet ${TEMPLATE_SHEET_NAME} tidak ditemukan di MAPPING.xlsx`);
    }

    for (const sheet of [...workbook.worksheets]) workbook.removeWorksheet(sheet.id);

    const worksheet = workbook.addWorksheet(TEMPLATE_SHEET_NAME);
    this._setupWorksheet(worksheet, templateSheet);
    this._writeBlocks(worksheet, templateSheet, config);

    workbook.creator = 'Keuangan Gereja';
    workbook.lastModifiedBy = 'Keuangan Gereja';
    workbook.created = new Date();
    workbook.modified = new Date();

    return workbook.xlsx.writeBuffer();
  }

  _setupWorksheet(worksheet, templateSheet) {
    worksheet.properties.defaultRowHeight = templateSheet.properties.defaultRowHeight;
    worksheet.views = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2', showGridLines: false }];
    worksheet.pageSetup = {
      ...clone(templateSheet.pageSetup),
      orientation: 'landscape',
      scale: 70,
      fitToPage: false,
      margins: {
        left: 0.236,
        right: 0.236,
        top: 0.748,
        bottom: 0.748,
        header: 0.315,
        footer: 0.315,
      },
    };

    SOURCE_COLUMNS.forEach((sourceColumn, index) => {
      const source = templateSheet.getColumn(sourceColumn);
      const target = worksheet.getColumn(index + 1);
      target.width = source.width;
      target.hidden = false;
    });
  }

  _writeBlocks(worksheet, templateSheet, config) {
    const lembars = Array.isArray(config.lembars) ? config.lembars : [];
    if (lembars.length === 0) {
      throw new Error('Tidak ada lembar Doorscrieft untuk di-export');
    }

    lembars.forEach((lembar, index) => {
      const rows = Array.isArray(lembar.rows) ? lembar.rows : [];
      if (rows.length > DETAIL_ROWS) {
        throw new Error(`Lembar ${index + 1} berisi ${rows.length} baris. Maksimal ${DETAIL_ROWS} baris per lembar.`);
      }

      const startRow = 1 + (index * BLOCK_SIZE);
      this._copyBlockStyle(worksheet, templateSheet, startRow);
      this._writeHeader(worksheet, startRow, getMonthName(lembar, rows));
      this._writeDetails(worksheet, startRow, rows);
      this._writeSummary(worksheet, startRow, index);
    });

    const lastRow = lembars.length * BLOCK_SIZE;
    worksheet.pageSetup.printArea = `A1:F${lastRow}`;
  }

  _copyBlockStyle(worksheet, templateSheet, startRow) {
    for (let offset = 0; offset < BLOCK_SIZE; offset += 1) {
      const sourceRowNumber = 1 + offset;
      const targetRowNumber = startRow + offset;
      const sourceRow = templateSheet.getRow(sourceRowNumber);
      const targetRow = worksheet.getRow(targetRowNumber);
      targetRow.height = sourceRow.height;

      SOURCE_COLUMNS.forEach((sourceColumn, index) => {
        const sourceCell = templateSheet.getCell(`${sourceColumn}${sourceRowNumber}`);
        const targetCell = worksheet.getCell(`${VISIBLE_COLUMNS[index]}${targetRowNumber}`);
        targetCell.style = clone(sourceCell.style) || {};
      });
    }
  }

  _writeHeader(worksheet, startRow, monthName) {
    worksheet.getCell(`A${startRow}`).value = 'NO';
    worksheet.getCell(`B${startRow}`).value = monthName;
    worksheet.getCell(`C${startRow}`).value = 'URAIAN';
    worksheet.getCell(`D${startRow}`).value = 'KODE ANGGARAN';
    worksheet.getCell(`E${startRow}`).value = 'PENERIMAAN';
    worksheet.getCell(`F${startRow}`).value = 'PENGELUARAN';
  }

  _writeDetails(worksheet, startRow, rows) {
    const detailStart = startRow + 1;
    const detailEnd = startRow + DETAIL_ROWS;

    for (let rowNumber = detailStart; rowNumber <= detailEnd; rowNumber += 1) {
      const source = rows[rowNumber - detailStart];
      const cells = ['A', 'B', 'C', 'D', 'E', 'F'].map((column) => worksheet.getCell(`${column}${rowNumber}`));

      if (!source) {
        cells.forEach((cell) => { cell.value = null; });
        cells[4].numFmt = CURRENCY_FORMAT;
        cells[5].numFmt = CURRENCY_FORMAT;
        continue;
      }

      const kode = normalizeKode(source.kodeAnggaran || source.kode_anggaran || source.kode);
      const tanggal = parseDate(source.tanggal);

      worksheet.getCell(`A${rowNumber}`).value = source.no || '';
      worksheet.getCell(`B${rowNumber}`).value = tanggal || source.tanggal || '';
      worksheet.getCell(`C${rowNumber}`).value = source.uraian || '';
      worksheet.getCell(`D${rowNumber}`).value = kode;
      worksheet.getCell(`E${rowNumber}`).value = toNumber(source.penerimaan);
      worksheet.getCell(`F${rowNumber}`).value = toNumber(source.pengeluaran);
      worksheet.getCell(`E${rowNumber}`).numFmt = CURRENCY_FORMAT;
      worksheet.getCell(`F${rowNumber}`).numFmt = CURRENCY_FORMAT;
    }
  }

  _writeSummary(worksheet, startRow, index) {
    const detailStart = startRow + 1;
    const detailEnd = startRow + DETAIL_ROWS;
    const jumlahTanggalRow = startRow + 27;
    const hariIniRow = startRow + 28;
    const jumlahSdTanggalRow = startRow + 29;
    const totalRow = startRow + 30;
    const sisaRow = startRow + 32;
    const previousTotalRow = startRow - BLOCK_SIZE + 30;

    worksheet.getCell(`B${jumlahTanggalRow}`).value = 'JUMLAH TANGGAL';
    worksheet.getCell(`E${jumlahTanggalRow}`).value = {
      formula: `SUM(E${detailStart}:E${detailEnd})`,
    };
    worksheet.getCell(`F${jumlahTanggalRow}`).value = {
      formula: `SUM(F${detailStart}:F${detailEnd})`,
    };

    worksheet.getCell(`B${hariIniRow}`).value = 'HARI INI';

    worksheet.getCell(`B${jumlahSdTanggalRow}`).value = 'JUMLAH S/D TANGGAL';
    worksheet.getCell(`E${jumlahSdTanggalRow}`).value = index === 0
      ? 0
      : { formula: `E${previousTotalRow}` };
    worksheet.getCell(`F${jumlahSdTanggalRow}`).value = index === 0
      ? 0
      : { formula: `F${previousTotalRow}` };

    worksheet.getCell(`B${totalRow}`).value = 'TOTAL';
    worksheet.getCell(`E${totalRow}`).value = { formula: `E${jumlahSdTanggalRow}+E${jumlahTanggalRow}` };
    worksheet.getCell(`F${totalRow}`).value = { formula: `F${jumlahSdTanggalRow}+F${jumlahTanggalRow}` };

    worksheet.getCell(`B${sisaRow}`).value = 'SISA';
    worksheet.getCell(`C${sisaRow}`).value = { formula: `E${totalRow}-F${totalRow}` };

    for (const rowNumber of [jumlahTanggalRow, jumlahSdTanggalRow, totalRow, sisaRow]) {
      for (const column of ['E', 'F']) worksheet.getCell(`${column}${rowNumber}`).numFmt = CURRENCY_FORMAT;
    }
    worksheet.getCell(`C${sisaRow}`).numFmt = CURRENCY_FORMAT;
  }
}

module.exports = { DoorscrieftExportService, TEMPLATE_SHEET_NAME };
