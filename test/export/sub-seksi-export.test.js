const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const ExcelJS = require('exceljs');
const { SubSeksiExportService } = require('../../electron/services/sub-seksi-export');
const { getTemplatePath, loadWorkbookFromBuffer, getCellFormula, getCellText } = require('./helpers');

function normalizeKode(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function findLeafCode(worksheet) {
  const codes = [];
  for (let row = 10; row <= 54; row += 1) {
    const cell = worksheet.getCell(`B${row}`);
    const code = normalizeKode(getCellText(cell));
    if (code) codes.push({ row, code });
  }

  return codes.find(({ code }) => !codes.some((item) => item.code !== code && item.code.startsWith(`${code}.`)));
}

describe('SubSeksiExportService', () => {
  it('should export SUB SEKSI with template rows, formulas, and totals for child codes', async () => {
    const templatePath = getTemplatePath();
    const templateWorkbook = new ExcelJS.Workbook();
    await templateWorkbook.xlsx.readFile(templatePath);
    const templateWs = templateWorkbook.getWorksheet('SUB SEKSI');
    assert(templateWs, 'SUB SEKSI template sheet must exist');

    const leaf = findLeafCode(templateWs);
    assert(leaf, 'A child template code must be found for test');

    const config = {
      tahun: 2027,
      doorscrieftTransaksis: [
        { tanggal: '2027-03-15', kodeAnggaran: leaf.code, penerimaan: 100000, pengeluaran: 0 },
        { tanggal: '2027-08-05', kodeAnggaran: leaf.code, penerimaan: 50000, pengeluaran: 0 },
      ],
    };

    const service = new SubSeksiExportService({ templatePath });
    const buffer = await service.export(config);
    assert(buffer instanceof Buffer, 'Export result should be a Buffer');

    const workbook = await loadWorkbookFromBuffer(buffer);
    assert.strictEqual(workbook.worksheets.length, 1);
    const worksheet = workbook.getWorksheet('SUB SEKSI');
    assert(worksheet, 'SUB SEKSI output sheet should exist');

    const targetRow = leaf.row;
    assert.strictEqual(getCellText(worksheet.getCell(`B${targetRow}`)), leaf.code);
    assert.strictEqual(getCellText(worksheet.getCell(`A${targetRow}`)), getCellText(templateWs.getCell(`A${targetRow}`)));

    assert.strictEqual(getCellText(worksheet.getCell(`D${targetRow}`)), '100000');
    assert.strictEqual(getCellText(worksheet.getCell(`E${targetRow}`)), '50000');
    assert(getCellFormula(worksheet.getCell(`F${targetRow}`)), 'expected formula to remain or be set');
    assert(getCellFormula(worksheet.getCell(`I${targetRow}`)), 'expected formula to remain or be set');

    const totalRow = 55;
    assert(getCellFormula(worksheet.getCell(`D${totalRow}`)) || getCellText(worksheet.getCell(`D${totalRow}`)), 'Total formula should exist');
    assert(getCellFormula(worksheet.getCell(`F${totalRow}`)) || getCellText(worksheet.getCell(`F${totalRow}`)), 'Total formula should exist');
  });

  it('should still export when no transaksi data is provided', async () => {
    const service = new SubSeksiExportService({ templatePath: getTemplatePath() });
    const buffer = await service.export({ tahun: 2027, doorscrieftTransaksis: [] });
    assert(buffer instanceof Buffer);
    const workbook = await loadWorkbookFromBuffer(buffer);
    assert.strictEqual(workbook.worksheets.length, 1);
    assert(workbook.getWorksheet('SUB SEKSI'));
  });
});