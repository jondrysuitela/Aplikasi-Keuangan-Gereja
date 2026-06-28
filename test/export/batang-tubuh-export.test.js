const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const ExcelJS = require('exceljs');
const { BatangTubuhExportService } = require('../../electron/services/batang-tubuh-export');
const { getTemplatePath, loadWorkbookFromBuffer, getCellFormula, getCellText, findRowByCode } = require('./helpers');

function normalizeKode(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function findLeafCode(worksheet) {
  const codes = [];
  for (let row = 1; row <= worksheet.rowCount; row += 1) {
    const code = normalizeKode(getCellText(worksheet.getCell(`A${row}`)));
    if (code) codes.push({ row, code });
  }
  return codes.slice().reverse().find(({ code }) => !codes.some((item) => item.code !== code && item.code.startsWith(`${code}.`)));
}

describe('BatangTubuhExportService', () => {
  it('should export BATANG TUBUH workbook with year and preserve formulas for child rows', async () => {
    const templatePath = getTemplatePath();
    const templateWorkbook = new ExcelJS.Workbook();
    await templateWorkbook.xlsx.readFile(templatePath);
    const templateWs = templateWorkbook.getWorksheet('BATANG TUBUH');
    assert(templateWs, 'BATANG TUBUH template sheet must exist');

    const leaf = findLeafCode(templateWs);
    assert(leaf, 'A child template code must be found for test');

    const config = {
      tahun: 2027,
      namaGereja: 'TEST GEREJA',
      klas: 'TEST KLAS',
      jemaat: 'TEST JEMAAT',
      batangTubuhs: [
        {
          kode: leaf.code,
          nama: 'Test Child',
          subSeksiKode: 'S1',
          subSeksiNama: 'Subseksi Test',
          detailRows: [
            { kode: leaf.code, nama: 'Detail Test', dianggarkan: 200000 },
          ],
        },
      ],
      doorscrieftTransaksis: [
        { tanggal: '2027-04-01', kodeAnggaran: leaf.code, penerimaan: 0, pengeluaran: 50000 },
      ],
    };

    const service = new BatangTubuhExportService({ templatePath });
    const buffer = await service.export([], config);
    assert(buffer instanceof Buffer);

    const workbook = await loadWorkbookFromBuffer(buffer);
    assert.strictEqual(workbook.worksheets.length, 1);
    const worksheet = workbook.getWorksheet('BATANG TUBUH');
    assert(worksheet, 'BATANG TUBUH output sheet should exist');

    assert(getCellText(worksheet.getCell('A1')).includes('TEST'));
    assert(getCellText(worksheet.getCell('A5')).includes('2027'));

    const outputRowNumber = findRowByCode(worksheet, 'A', leaf.code);
    assert(outputRowNumber > 0, `Expected code ${leaf.code} to appear in output worksheet`);
    assert.strictEqual(getCellText(worksheet.getCell(`C${outputRowNumber}`)), '200000');
    assert.strictEqual(getCellText(worksheet.getCell(`D${outputRowNumber}`)), '50000');
    assert(getCellFormula(worksheet.getCell(`E${outputRowNumber}`)), 'expected formula to remain or be set');
  });

  it('should export successfully even when no batang tubuh data exists', async () => {
    const service = new BatangTubuhExportService({ templatePath: getTemplatePath() });
    const buffer = await service.export([], { tahun: 2027 });
    assert(buffer instanceof Buffer);
    const workbook = await loadWorkbookFromBuffer(buffer);
    assert.strictEqual(workbook.worksheets.length, 1);
    assert(workbook.getWorksheet('BATANG TUBUH'));
  });
});
