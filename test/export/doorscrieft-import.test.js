const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const ExcelJS = require('exceljs');
const { DoorscrieftImportService } = require('../../electron/services/doorscrieft-import');

describe('DoorscrieftImportService', () => {
  it('should parse Indonesian day/month/year dates correctly', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('DOORSCRIEFT2');
    worksheet.getRow(1).values = [null, 'NO', 'TANGGAL', 'URAIAN', 'KODE ANGGARAN', 'PENERIMAAN', 'PENGELUARAN'];
    worksheet.getRow(2).values = [null, '1', '01/05/2027', 'Penerimaan Kas', 'I.1.1', 100000, null];

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doorscrieft-import-'));
    const filePath = path.join(tempDir, 'doorscrieft-import.xlsx');
    await workbook.xlsx.writeFile(filePath);

    const service = new DoorscrieftImportService();
    const preview = await service.preview(filePath, { year: 2027, validCodes: ['I.1.1'] });

    assert.strictEqual(preview.totalRows, 1);
    assert.strictEqual(preview.validRows, 1);
    assert.strictEqual(preview.rows[0].tanggal, '2027-05-01');
    assert.deepStrictEqual(preview.errors, []);
  });

  it('should normalize kode anggaran with trailing dot', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('DOORSCRIEFT2');
    worksheet.getRow(1).values = [null, 'NO', 'TANGGAL', 'URAIAN', 'KODE ANGGARAN', 'PENERIMAAN', 'PENGELUARAN'];
    worksheet.getRow(2).values = [null, '1', '2027-06-15', 'Penerimaan Kas', 'I.1.1.', 100000, null];

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doorscrieft-import-'));
    const filePath = path.join(tempDir, 'doorscrieft-import.xlsx');
    await workbook.xlsx.writeFile(filePath);

    const service = new DoorscrieftImportService();
    const preview = await service.preview(filePath, { year: 2027, validCodes: ['I.1.1'] });

    assert.strictEqual(preview.validRows, 1);
    assert.strictEqual(preview.rows[0].kodeAnggaran, 'I.1.1');
  });
});
