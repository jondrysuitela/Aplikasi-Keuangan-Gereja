const ExcelJS = require('exceljs');

const SHEET_NAME = 'REALISASI PERBULAN';
const CURRENCY_FORMAT = '_-"Rp"* #,##0_-;-"Rp"* #,##0_-;_-"Rp"* "-"_-;_-@_-';

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function text(value, fallback = '') {
  const result = String(value || '').trim();
  return result || fallback;
}

function monthLabel(row, tahun) {
  return text(row.monthName, 'Bulan') + ' ' + tahun;
}

function applyBorder(cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };
}

function styleRow(row, options = {}) {
  row.eachCell((cell) => {
    applyBorder(cell);
    cell.alignment = {
      vertical: 'middle',
      horizontal: options.align || 'left',
      wrapText: true,
    };
    if (options.bold) cell.font = { ...(cell.font || {}), bold: true };
    if (options.fill) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: options.fill },
      };
    }
  });
}

class RealisasiPerbulanExportService {
  async export(config = {}) {
    const tahun = Number(config.tahun) || new Date().getFullYear();
    const monthlyData = Array.isArray(config.monthlyData) ? config.monthlyData : [];
    if (monthlyData.length === 0) {
      throw new Error('Tidak ada data Realisasi Perbulan untuk di-export');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Keuangan Gereja';
    workbook.lastModifiedBy = 'Keuangan Gereja';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet(SHEET_NAME);
    this._setupWorksheet(worksheet);
    this._writeHeader(worksheet, config, tahun);
    this._writeTable(worksheet, monthlyData, config.totals || {}, tahun);
    this._writeSignatures(worksheet);

    return workbook.xlsx.writeBuffer();
  }

  _setupWorksheet(worksheet) {
    worksheet.views = [{ state: 'frozen', ySplit: 10, topLeftCell: 'A11', showGridLines: false }];
    worksheet.pageSetup = {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    };
    worksheet.columns = [
      { key: 'no', width: 8 },
      { key: 'uraian', width: 28 },
      { key: 'jumlahPendapatan', width: 20 },
      { key: 'jumlahPengeluaran', width: 20 },
      { key: 'ukpPendapatan', width: 18 },
      { key: 'ukpPengeluaran', width: 18 },
    ];
  }

  _writeHeader(worksheet, config, tahun) {
    const namaGereja = text(config.namaGereja, 'Gereja Protestan Maluku');
    const kopSub = text(config.kopSub, '(ANGGOTA PGI)');
    const klasis = text(config.klasis, 'KLASIS');
    const namaJemaat = text(config.namaJemaat, 'JEMAAT');
    const printedAt = text(config.printedAt, new Date().toLocaleString('id-ID'));
    const reportStatus = text(config.reportStatus, 'Siap Cetak');

    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = namaGereja.toUpperCase();
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A2:F2');
    worksheet.getCell('A2').value = kopSub;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A3:F3');
    worksheet.getCell('A3').value = klasis.toUpperCase();
    worksheet.getCell('A3').font = { bold: true };
    worksheet.getCell('A3').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A4:F4');
    worksheet.getCell('A4').value = namaJemaat.toUpperCase();
    worksheet.getCell('A4').font = { bold: true, size: 12 };
    worksheet.getCell('A4').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A6:F6');
    worksheet.getCell('A6').value = 'REALISASI PERBULAN';
    worksheet.getCell('A6').font = { bold: true, size: 13 };
    worksheet.getCell('A6').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A7:F7');
    worksheet.getCell('A7').value = `Tahun Anggaran ${tahun}`;
    worksheet.getCell('A7').alignment = { horizontal: 'center' };

    worksheet.getCell('A9').value = 'Periode';
    worksheet.getCell('B9').value = `Januari - Desember ${tahun}`;
    worksheet.getCell('C9').value = 'Tanggal Export';
    worksheet.getCell('D9').value = printedAt;
    worksheet.getCell('E9').value = 'Status Validasi';
    worksheet.getCell('F9').value = reportStatus;
    styleRow(worksheet.getRow(9), { bold: true, fill: 'FFF8FAFC' });
  }

  _writeTable(worksheet, monthlyData, totals, tahun) {
    worksheet.getRow(11).values = ['No', 'URAIAN', 'JUMLAH PENDAPATAN', 'JUMLAH PENGELUARAN', 'UKP', ''];
    worksheet.mergeCells('E11:F11');
    worksheet.getRow(12).values = ['', '', '', '', 'PENDAPATAN', 'PENGELUARAN'];
    worksheet.mergeCells('A12:D12');

    for (const rowNumber of [11, 12]) {
      const row = worksheet.getRow(rowNumber);
      row.height = 22;
      styleRow(row, { bold: true, fill: rowNumber === 11 ? 'FFE2E8F0' : 'FFF1F5F9', align: 'center' });
    }

    let cursor = 13;
    monthlyData.forEach((item, index) => {
      const row = worksheet.getRow(cursor);
      row.values = [
        index + 1,
        monthLabel(item, tahun),
        toNumber(item.jumlahPendapatan),
        toNumber(item.jumlahPengeluaran),
        toNumber(item.ukpPendapatan),
        toNumber(item.ukpPengeluaran),
      ];
      styleRow(row);
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      for (const cellIndex of [3, 4, 5, 6]) row.getCell(cellIndex).numFmt = CURRENCY_FORMAT;
      cursor += 1;
    });

    const murniRow = worksheet.getRow(cursor);
    murniRow.values = [
      '',
      'PENDAPATAN MURNI',
      toNumber(totals.pendapatanMurniPendapatan),
      toNumber(totals.pendapatanMurniPengeluaran),
      toNumber(totals.totalUkpPendapatan),
      toNumber(totals.totalUkpPengeluaran),
    ];
    styleRow(murniRow, { bold: true, fill: 'FFF8FAFC' });
    for (const cellIndex of [3, 4, 5, 6]) murniRow.getCell(cellIndex).numFmt = CURRENCY_FORMAT;
    cursor += 1;

    const totalRow = worksheet.getRow(cursor);
    totalRow.values = [
      '',
      'TOTAL',
      toNumber(totals.totalPendapatan),
      toNumber(totals.totalPengeluaran),
      toNumber(totals.totalUkpPendapatan),
      '',
    ];
    styleRow(totalRow, { bold: true, fill: 'FFE2E8F0' });
    for (const cellIndex of [3, 4, 5]) totalRow.getCell(cellIndex).numFmt = CURRENCY_FORMAT;
    cursor += 1;

    const sisaRow = worksheet.getRow(cursor);
    sisaRow.values = ['', 'SISA SALDO', toNumber(totals.sisaSaldo), '', '', ''];
    worksheet.mergeCells(`C${cursor}:F${cursor}`);
    styleRow(sisaRow, { bold: true });
    sisaRow.getCell(3).numFmt = CURRENCY_FORMAT;
    sisaRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };

    worksheet.pageSetup.printArea = `A1:F${cursor + 7}`;
  }

  _writeSignatures(worksheet) {
    const startRow = worksheet.lastRow.number + 3;
    worksheet.mergeCells(`A${startRow}:C${startRow}`);
    worksheet.mergeCells(`D${startRow}:F${startRow}`);
    worksheet.getCell(`A${startRow}`).value = 'Mengetahui,';
    worksheet.getCell(`D${startRow}`).value = 'Disusun oleh,';

    worksheet.mergeCells(`A${startRow + 1}:C${startRow + 1}`);
    worksheet.mergeCells(`D${startRow + 1}:F${startRow + 1}`);
    worksheet.getCell(`A${startRow + 1}`).value = 'Ketua Majelis Jemaat';
    worksheet.getCell(`D${startRow + 1}`).value = 'Bendahara Jemaat';

    worksheet.mergeCells(`A${startRow + 5}:C${startRow + 5}`);
    worksheet.mergeCells(`D${startRow + 5}:F${startRow + 5}`);
    worksheet.getCell(`A${startRow + 5}`).value = '____________________________';
    worksheet.getCell(`D${startRow + 5}`).value = '____________________________';

    for (let rowNumber = startRow; rowNumber <= startRow + 5; rowNumber += 1) {
      for (const column of ['A', 'D']) {
        const cell = worksheet.getCell(`${column}${rowNumber}`);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (rowNumber === startRow + 1) cell.font = { bold: true };
      }
    }
  }
}

module.exports = { RealisasiPerbulanExportService, SHEET_NAME };
