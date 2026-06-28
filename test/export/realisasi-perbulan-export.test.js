const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { RealisasiPerbulanExportService } = require('../../electron/services/realisasi-perbulan-export');
const { loadWorkbookFromBuffer, getCellText, getNumberValue } = require('./helpers');

const monthlyData = [
  {
    month: 1,
    monthName: 'Januari',
    transaksi: 2,
    jumlahPendapatan: 2000000,
    jumlahPengeluaran: 500000,
    ukpPendapatan: 100000,
    ukpPengeluaran: 25000,
  },
  {
    month: 2,
    monthName: 'Februari',
    transaksi: 1,
    jumlahPendapatan: 3000000,
    jumlahPengeluaran: 750000,
    ukpPendapatan: 200000,
    ukpPengeluaran: 50000,
  },
];

describe('RealisasiPerbulanExportService', () => {
  it('should export a dedicated Realisasi Perbulan report workbook', async () => {
    const exporter = new RealisasiPerbulanExportService();
    const buffer = await exporter.export({
      tahun: 2027,
      namaGereja: 'Gereja Protestan Maluku',
      kopSub: '(ANGGOTA PGI)',
      klasis: 'Klasis Pulau Ambon Timur',
      namaJemaat: 'Jemaat Contoh',
      monthlyData,
      totals: {
        totalPendapatan: 5000000,
        totalPengeluaran: 1250000,
        totalUkpPendapatan: 300000,
        totalUkpPengeluaran: 75000,
        pendapatanMurniPendapatan: 4700000,
        pendapatanMurniPengeluaran: 1175000,
        sisaSaldo: 3750000,
      },
      reportStatus: 'Siap Cetak',
      printedAt: '14 Juni 2026 10.00',
    });

    assert(buffer instanceof Buffer, 'Export result should be a Buffer');
    const workbook = await loadWorkbookFromBuffer(buffer);
    const worksheet = workbook.getWorksheet('REALISASI PERBULAN');
    assert(worksheet, 'REALISASI PERBULAN sheet should exist');

    assert.strictEqual(getCellText(worksheet.getCell('A6')), 'REALISASI PERBULAN');
    assert.strictEqual(getCellText(worksheet.getCell('A7')), 'Tahun Anggaran 2027');
    assert.strictEqual(getCellText(worksheet.getCell('B13')), 'Januari 2027');
    assert.strictEqual(getNumberValue(worksheet.getCell('C13')), 2000000);
    assert.strictEqual(getNumberValue(worksheet.getCell('D14')), 750000);
    assert.strictEqual(getCellText(worksheet.getCell('B15')), 'PENDAPATAN MURNI');
    assert.strictEqual(getNumberValue(worksheet.getCell('C16')), 5000000);
    assert.strictEqual(getCellText(worksheet.getCell('B17')), 'SISA SALDO');
    assert.strictEqual(getNumberValue(worksheet.getCell('C17')), 3750000);
  });

  it('should fail when monthly data is empty', async () => {
    const exporter = new RealisasiPerbulanExportService();
    await assert.rejects(async () => exporter.export({ monthlyData: [] }), {
      message: /Tidak ada data Realisasi Perbulan untuk di-export/,
    });
  });
});
