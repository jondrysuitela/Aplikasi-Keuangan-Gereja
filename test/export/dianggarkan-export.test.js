const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const ExcelJS = require('exceljs');
const { DianggarkanExportService } = require('../../electron/services/dianggarkan-export');
const { getTemplatePath, loadWorkbookFromBuffer, getCellText, findRowByCode } = require('./helpers');

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

describe('DianggarkanExportService', () => {
  it('should export RAPB format with detail in keterangan column', async () => {
    const templatePath = getTemplatePath();
    const templateWorkbook = new ExcelJS.Workbook();
    await templateWorkbook.xlsx.readFile(templatePath);
    const templateWs = templateWorkbook.getWorksheet('BATANG TUBUH');
    assert(templateWs, 'BATANG TUBUH template sheet must exist');

    const leaf = findLeafCode(templateWs);
    assert(leaf, 'A child template code must be found for test');

    const config = {
      tahun: 2026,
      namaGereja: 'TEST GEREJA',
      klas: 'TEST KLAS',
      jemaat: 'TEST JEMAAT',
      batangTubuhs: [
        {
          kode: leaf.code,
          nama: 'Test Child',
          detailRows: [
            { kode: leaf.code, nama: 'Detail Test', dianggarkan: 500000 },
          ],
        },
      ],
      doorscrieftTransaksis: [
        { tanggal: '2026-05-01', kodeAnggaran: leaf.code, penerimaan: 125000, pengeluaran: 0 },
      ],
      batangTubuhProgramByYear: {
        2026: {
          [leaf.code]: [
            {
              id: 'program-1',
              namaProgram: 'Pelayanan Mingguan',
              rincian: [
                { id: 'rincian-1', keterangan: 'Narasumber = Rp250.000', jumlah: 250000 },
                { id: 'rincian-2', keterangan: 'Transport', jumlah: 250000 },
              ],
            },
            {
              id: 'program-2',
              namaProgram: 'Pelayanan Anak',
              rincian: [
                { id: 'rincian-3', keterangan: 'Bahan ajar', jumlah: 100000 },
              ],
            },
          ],
        },
      },
    };

    const service = new DianggarkanExportService({ templatePath });
    const buffer = await service.export([], config);
    assert(buffer instanceof Buffer);

    const workbook = await loadWorkbookFromBuffer(buffer);
    assert.strictEqual(workbook.worksheets.length, 1);
    const worksheet = workbook.getWorksheet('BATANG TUBUH');
    assert(worksheet, 'BATANG TUBUH output sheet should exist');

    assert.strictEqual(getCellText(worksheet.getCell('A5')), 'RANCANGAN ANGGARAN PENDAPATAN DAN BELANJA TAHUN 2026');
    assert.strictEqual(getCellText(worksheet.getCell('D7')), 'REALISASI 2026');
    assert.strictEqual(getCellText(worksheet.getCell('E7')), 'KETERANGAN');
    assert.strictEqual(worksheet.getColumn(5).hidden, false);
    assert.strictEqual(worksheet.getColumn(6).hidden, true);

    const outputRowNumber = findRowByCode(worksheet, 'A', leaf.code);
    assert(outputRowNumber > 0, `Expected code ${leaf.code} to appear in output worksheet`);
    assert.strictEqual(getCellText(worksheet.getCell(`C${outputRowNumber}`)), '500000');
    assert.strictEqual(getCellText(worksheet.getCell(`D${outputRowNumber}`)), '125000');
    const keterangan = getCellText(worksheet.getCell(`E${outputRowNumber}`));
    assert(keterangan.includes('Pelayanan Mingguan'));
    assert(!keterangan.includes('Program:'));
    assert(keterangan.includes('Narasumber = Rp250.000'));
    assert(keterangan.includes('Transport'));
    assert(!keterangan.includes('Pelayanan Anak'));
    const keteranganValue = worksheet.getCell(`E${outputRowNumber}`).value;
    assert(Array.isArray(keteranganValue.richText));
    assert.strictEqual(keteranganValue.richText[0].text, 'Pelayanan Mingguan');
    assert.strictEqual(keteranganValue.richText[0].font.bold, true);
    assert(!keteranganValue.richText.some((part) => String(part.text || '').includes('Narasumber') && part.font?.bold));
    const nextKeterangan = getCellText(worksheet.getCell(`E${outputRowNumber + 1}`));
    assert(nextKeterangan.includes('Pelayanan Anak'));
    assert(nextKeterangan.includes('Bahan ajar'));
    const nextKeteranganValue = worksheet.getCell(`E${outputRowNumber + 1}`).value;
    assert(Array.isArray(nextKeteranganValue.richText));
    assert.strictEqual(nextKeteranganValue.richText[0].text, 'Pelayanan Anak');
    assert.strictEqual(nextKeteranganValue.richText[0].font.bold, true);
    assert.strictEqual(getCellText(worksheet.getCell(`A${outputRowNumber + 1}`)), '');
    assert.strictEqual(getCellText(worksheet.getCell(`C${outputRowNumber + 1}`)), '');
    assert.strictEqual(getCellText(worksheet.getCell(`D${outputRowNumber + 1}`)), '');
    assert.strictEqual(getCellText(worksheet.getCell(`F${outputRowNumber}`)), '');
  });
});
