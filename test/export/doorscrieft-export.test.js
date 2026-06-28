const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { DoorscrieftExportService } = require('../../electron/services/doorscrieft-export');
const { getTemplatePath, loadWorkbookFromBuffer, getCellFormula, getNumberValue } = require('./helpers');

const mockConfig = {
  tahun: 2027,
  lembars: [
    {
      monthName: 'FEBRUARI',
      rows: [
        { no: '1', tanggal: '2027-02-14', uraian: 'Pemasukan A', kodeAnggaran: 'I.1.1', penerimaan: 1500000, pengeluaran: 0 },
        { no: '2', tanggal: '2027-02-15', uraian: 'Pengeluaran B', kodeAnggaran: 'II.2.1', penerimaan: 0, pengeluaran: 250000 },
      ],
      harianP: 1500000,
      harianQ: 250000,
      sDP: 0,
      sDQ: 0,
      totalP: 1500000,
      totalQ: 250000,
      sisa: 1250000,
    },
  ],
};

describe('DoorscrieftExportService', () => {
  it('should export a valid Doorscrieft workbook with expected sheet and headers', async () => {
    const exporter = new DoorscrieftExportService({ templatePath: getTemplatePath() });
    const buffer = await exporter.export(mockConfig);
    assert(buffer instanceof Buffer, 'Export result should be a Buffer');

    const workbook = await loadWorkbookFromBuffer(buffer);
    assert.strictEqual(workbook.worksheets.length, 1, 'Workbook should contain one worksheet');
    const worksheet = workbook.getWorksheet('DOORSCRIEFT');
    assert(worksheet, 'DOORSCRIEFT sheet should exist');

    assert.strictEqual(worksheet.getCell('A1').value, 'NO');
    assert.strictEqual(worksheet.getCell('B1').value, 'FEBRUARI');
    assert.strictEqual(worksheet.getCell('C1').value, 'URAIAN');
    assert.strictEqual(worksheet.getCell('D1').value, 'KODE ANGGARAN');
    assert.strictEqual(worksheet.getCell('E1').value, 'PENERIMAAN');
    assert.strictEqual(worksheet.getCell('F1').value, 'PENGELUARAN');

    assert.strictEqual(getNumberValue(worksheet.getCell('E2')), 1500000);
    assert.strictEqual(getNumberValue(worksheet.getCell('F2')), 0);
    assert.strictEqual(getNumberValue(worksheet.getCell('E3')), 0);
    assert.strictEqual(getNumberValue(worksheet.getCell('F3')), 250000);

    assert.strictEqual(getCellFormula(worksheet.getCell('E28')), 'SUM(E2:E26)');
    assert.strictEqual(getCellFormula(worksheet.getCell('F28')), 'SUM(F2:F26)');
    assert.strictEqual(getCellFormula(worksheet.getCell('E31')), 'E30+E28');
    assert.strictEqual(getCellFormula(worksheet.getCell('F31')), 'F30+F28');
    assert.strictEqual(getCellFormula(worksheet.getCell('C33')), 'E31-F31');
  });

  it('should fail gracefully when there is no doorscrieft lembar data', async () => {
    const exporter = new DoorscrieftExportService({ templatePath: getTemplatePath() });
    await assert.rejects(async () => exporter.export({ lembars: [] }), {
      message: /Tidak ada lembar Doorscrieft untuk di-export/,
    });
  });
});