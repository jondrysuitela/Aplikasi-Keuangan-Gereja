const ExcelJS = require('exceljs');
const fs = require('fs');

const TEMPLATE_SHEET_NAME = 'BATANG TUBUH';
const NUMBER_FORMAT_RP = '#,##0';

function cellToString(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('').trim();
    if (value.text) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    if (value.formula) return String(value.result || '').trim();
  }
  return String(value).trim();
}

function normalizeKode(value) {
  return cellToString(value).replace(/\s+/g, '').toUpperCase();
}

function normalizeKodeForLookup(value) {
  const kode = normalizeKode(value);
  return kode.startsWith('1.') ? `I.${kode.slice(2)}` : kode;
}

function parentPrefix(kode) {
  return kode.endsWith('.') ? kode : `${kode}.`;
}

function isParentCode(kode, allCodes) {
  if (!kode) return false;
  const prefix = parentPrefix(kode);
  return allCodes.some((candidate) => candidate !== kode && candidate.startsWith(prefix));
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

function getFormula(cell) {
  if (cell.formula) return cell.formula;
  if (cell.value && typeof cell.value === 'object') {
    if (cell.value.formula) return cell.value.formula;
    if (cell.value.sharedFormula && cell.formula) return cell.formula;
  }
  return '';
}

function isFormulaCell(cell) {
  return Boolean(getFormula(cell));
}

class BatangTubuhExportService {
  constructor({ templatePath, logoPath } = {}) {
    this.templatePath = templatePath;
    this.logoPath = logoPath;
  }

  async export(_hierarchicalData = [], config = {}) {
    if (!this.templatePath) {
      throw new Error('Path template MAPPING.xlsx belum diset');
    }

    const year = Number(config.tahun) || new Date().getFullYear();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.templatePath);

    const worksheet = workbook.getWorksheet(TEMPLATE_SHEET_NAME);
    if (!worksheet) {
      throw new Error(`Sheet ${TEMPLATE_SHEET_NAME} tidak ditemukan di MAPPING.xlsx`);
    }

    for (const sheet of [...workbook.worksheets]) {
      if (sheet.name !== TEMPLATE_SHEET_NAME) workbook.removeWorksheet(sheet.id);
    }

    this._fillWorksheet(worksheet, config, year);
    this._addLogo(workbook, worksheet);

    workbook.creator = 'Keuangan Gereja';
    workbook.lastModifiedBy = 'Keuangan Gereja';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;
    workbook.calcProperties.forceFullCalc = true;

    return workbook.xlsx.writeBuffer();
  }

  _fillWorksheet(worksheet, config, year) {
    const budgetMap = this._buildBudgetMap(config.batangTubuhs || []);
    const realisasiMap = this._buildRealisasiMap(config.doorscrieftTransaksis || [], year);
    const rowCodes = this._collectTemplateCodes(worksheet);
    const allCodes = rowCodes.map((item) => item.lookupKode).filter(Boolean);
    const formulas = this._captureFormulas(worksheet);

    worksheet.name = TEMPLATE_SHEET_NAME;
    worksheet.getCell('A1').value = config.namaGereja || 'GEREJA PROTESTAN MALUKU';
    worksheet.getCell('A2').value = '(ANGGOTA PGI)';
    worksheet.getCell('A3').value = config.klas || 'KLASIS  PULAU  AMBON TIMUR';
    worksheet.getCell('A4').value = config.jemaat || 'JEMAAT SULI';
    worksheet.getCell('A5').value = `REALISASI ANGGARAN PENDAPATAN DAN BELANJA TAHUN ${year}`;
    worksheet.getCell('C7').value = `DIANGGARKAN ${year}`;
    worksheet.getCell('D7').value = `REALISASI ${year}`;

    for (const rowInfo of rowCodes) {
      const { rowNumber, lookupKode } = rowInfo;
      const isParent = isParentCode(lookupKode, allCodes);
      const hasBudget = budgetMap.has(lookupKode);
      const hasRealisasi = realisasiMap.has(lookupKode);
      const isChild = !isParent && (hasBudget || hasRealisasi);

      if (isChild) {
        this._setNumberOrBlank(worksheet.getCell(`C${rowNumber}`), budgetMap.get(lookupKode));
        this._setNumberOrBlank(worksheet.getCell(`D${rowNumber}`), realisasiMap.get(lookupKode));
        this._restoreFormulaOrBlank(worksheet.getCell(`E${rowNumber}`), formulas[`E${rowNumber}`]);
      } else {
        worksheet.getCell(`C${rowNumber}`).value = null;
        worksheet.getCell(`D${rowNumber}`).value = null;
        worksheet.getCell(`E${rowNumber}`).value = null;
      }
    }

    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const kode = normalizeKodeForLookup(worksheet.getCell(`A${rowNumber}`).value);
      if (kode) continue;
      for (const column of ['C', 'D', 'E']) {
        const address = `${column}${rowNumber}`;
        if (formulas[address]) {
          worksheet.getCell(address).value = { formula: formulas[address] };
          worksheet.getCell(address).numFmt = NUMBER_FORMAT_RP;
        }
      }
    }

    worksheet.pageSetup = {
      ...worksheet.pageSetup,
      orientation: 'landscape',
      printArea: `A1:F${worksheet.rowCount}`,
    };
    if (!worksheet.views || worksheet.views.length === 0) {
      worksheet.views = [{ state: 'frozen', ySplit: 8, topLeftCell: 'A9', showGridLines: false }];
    } else {
      worksheet.views = worksheet.views.map((view) => ({ ...view, showGridLines: false }));
    }
  }

  _collectTemplateCodes(worksheet) {
    const rows = [];
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const displayKode = cellToString(worksheet.getCell(`A${rowNumber}`).value);
      const lookupKode = normalizeKodeForLookup(displayKode);
      if (!lookupKode) continue;
      if (!/^(I|II|III|IV|V|VI|VII|VIII|IX|X)\./.test(lookupKode)) continue;
      rows.push({ rowNumber, displayKode, lookupKode });
    }
    return rows;
  }

  _captureFormulas(worksheet) {
    const formulas = {};
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      for (const column of ['C', 'D', 'E']) {
        const address = `${column}${rowNumber}`;
        const cell = worksheet.getCell(address);
        if (isFormulaCell(cell)) formulas[address] = getFormula(cell);
      }
    }
    return formulas;
  }

  _buildBudgetMap(batangTubuhs) {
    const map = new Map();
    if (!Array.isArray(batangTubuhs)) return map;

    for (const item of batangTubuhs) {
      const detailRows = Array.isArray(item?.detailRows) ? item.detailRows : [];
      for (const row of detailRows) {
        const kode = normalizeKodeForLookup(row?.kode || row?.kodeAnggaran);
        if (!kode) continue;
        const value = toNumber(row?.dianggarkan);
        map.set(kode, (map.get(kode) || 0) + value);
      }
    }

    return map;
  }

  _buildRealisasiMap(transaksis, year) {
    const map = new Map();
    if (!Array.isArray(transaksis)) return map;

    for (const row of transaksis) {
      const date = parseDate(row?.tanggal || row?.date);
      if (!date || date.getFullYear() !== year) continue;
      const kode = normalizeKodeForLookup(row?.kodeAnggaran || row?.kode_anggaran || row?.kode);
      if (!kode) continue;
      const value = toNumber(row?.penerimaan) + toNumber(row?.pengeluaran);
      map.set(kode, (map.get(kode) || 0) + value);
    }

    return map;
  }

  _setNumberOrBlank(cell, value) {
    const number = toNumber(value);
    cell.value = number === 0 ? null : number;
    cell.numFmt = NUMBER_FORMAT_RP;
  }

  _restoreFormulaOrBlank(cell, formula) {
    cell.value = formula ? { formula } : null;
    if (formula) cell.numFmt = NUMBER_FORMAT_RP;
  }

  _addLogo(workbook, worksheet) {
    if (!this.logoPath || !fs.existsSync(this.logoPath)) return;

    const imageId = workbook.addImage({
      buffer: fs.readFileSync(this.logoPath),
      extension: 'png',
    });

    worksheet.addImage(imageId, {
      tl: { col: 0.85, row: 0.05 },
      ext: { width: 88, height: 88 },
      editAs: 'absolute',
    });
  }
}

module.exports = { BatangTubuhExportService };

