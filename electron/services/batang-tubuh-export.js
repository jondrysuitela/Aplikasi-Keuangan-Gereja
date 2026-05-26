const ExcelJS = require('exceljs');

// ============================================================
// STYLE CONSTANTS
// ============================================================
const COLORS = {
  white: 'FFFFFF',
  black: '000000',
  lightGray: 'F2F2F2',
  mediumGray: 'D9D9D9',
};

const LEVEL_STYLES = {
  SUBTOTAL: {
    font: { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.black } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.mediumGray } },
  },
  BAGIAN_SUBTOTAL: {
    font: { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.black } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D6DCE4' } },
  },
  GRANDTOTAL: {
    font: { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.white } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F5496' } },
  },
};

const NUMBER_FORMAT_RP = '#,##0';

// ============================================================
// HIERARCHY HELPERS
// ============================================================
function detectLevel(kode) {
  const cleaned = String(kode).trim().replace(/\s+/g, '');
  const parts = cleaned.split('.');
  return parts.length;
}

function getIndent(kode) {
  const level = detectLevel(kode);
  return Math.max(0, (level - 1) * 4);
}

function indentText(text, kode) {
  const spaces = getIndent(kode);
  return ' '.repeat(spaces) + String(text);
}

// ============================================================
// EXPORT SERVICE
// ============================================================
class BatangTubuhExportService {
  /**
   * Build full workbook from hierarchical Batang Tubuh data
   * @param {Array} subSeksis - hierarchical array from batang-tubuh.json
   * @param {Object} config - { namaGereja, klas, jemaat, tahun, doorscrieftTransaksis }
   * @returns {Buffer} xlsx buffer
   */
  async export(subSeksis, config = {}) {
    const {
      namaGereja = 'GEREJA PROTESTAN MALUKU',
      klas = 'KLASIS PULAU AMBON TIMUR',
      jemaat = 'JEMAAT SULI',
      tahun = '2025',
      doorscrieftTransaksis = [],
    } = config;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Aplikasi Keuangan Gereja';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('BATANG TUBUH', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 8 }],
    });

    // Column widths
    ws.columns = [
      { key: 'kode', width: 22 },
      { key: 'nama', width: 65 },
      { key: 'dianggarkan', width: 22 },
      { key: 'realisasi', width: 22 },
      { key: 'selisih', width: 22 },
      { key: 'keterangan', width: 18 },
    ];

    // Header
    this._addHeader(ws, { namaGereja, klas, jemaat, tahun });

    // Data rows
    let rowNum = 9;
    rowNum = this._addData(ws, rowNum, subSeksis, doorscrieftTransaksis, tahun);

    // Print setup
    ws.pageSetup.orientation = 'landscape';
    ws.pageSetup.paperSize = 9;
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 0;
    ws.pageSetup.margins = {
      left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3,
    };
    ws.pageSetup.printTitlesRows = '1:8';

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  _addHeader(ws, { namaGereja, klas, jemaat, tahun }) {
    const thinBorder = { style: 'thin', color: { argb: '808080' } };
    const medBorder = { style: 'medium', color: { argb: '808080' } };

    // Title rows
    const titles = [
      namaGereja,
      '(ANGGOTA PGI)',
      klas,
      jemaat,
      'REALISASI ANGGARAN PENDAPATAN DAN BELANJA TAHUN ' + tahun,
    ];
    titles.forEach((text, idx) => {
      const r = idx + 1;
      ws.mergeCells(r, 1, r, 6);
      ws.getRow(r).height = idx === 4 ? 25 : 20;
      const cell = ws.getCell(r, 1);
      cell.value = text;
      cell.font = { name: 'Calibri', size: idx === 4 ? 14 : 12, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { ...thinBorder, bottom: idx === 4 ? { style: 'double', color: { argb: COLORS.black } } : thinBorder };
    });

    // Empty row
    ws.getRow(6).height = 5;

    // Table header row 7
    const headers = ['KODE ANGGARAN', 'MATA ANGGARAN', 'DIANGGARKAN ' + tahun, 'REALISASI ' + tahun, 'LEBIH / KURANG', 'KETERANGAN'];
    const hr = ws.getRow(7);
    hr.height = 30;
    headers.forEach((h, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F5496' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: medBorder, left: thinBorder, bottom: medBorder, right: thinBorder,
      };
    });

    // Column number row 8
    const nr = ws.getRow(8);
    nr.height = 18;
    for (let i = 0; i < 6; i++) {
      const cell = nr.getCell(i + 1);
      cell.value = i + 1;
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    }
  }

  _addData(ws, rowNum, subSeksis, transaksis, tahun) {
    const thinBorder = { style: 'thin', color: { argb: '808080' } };
    const medBorder = { style: 'medium', color: { argb: '808080' } };

    let grandDianggarkan = 0;
    let grandRealisasi = 0;

    subSeksis.forEach((sub) => {
      if (!sub.batangTubuh || sub.batangTubuh.length === 0) return;

      let subDianggarkan = 0;
      let subRealisasi = 0;

      // Bagian header row
      const bhRow = ws.getRow(rowNum);
      bhRow.height = 20;
      ws.mergeCells(rowNum, 1, rowNum, 2);
      const bhCell = ws.getCell(rowNum, 1);
      bhCell.value = sub.kode + ' ' + sub.nama;
      bhCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.black } };
      bhCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightGray } };
      bhCell.alignment = { horizontal: 'left', vertical: 'middle' };
      for (let c = 1; c <= 6; c++) {
        ws.getCell(rowNum, c).border = { ...thinBorder, bottom: medBorder };
      }
      rowNum++;

      sub.batangTubuh.forEach((bt) => {
        let posDianggarkan = 0;
        let posRealisasi = 0;
        let currentPosPrefix = '';

        bt.detailRows.forEach((dr) => {
          const dianggarkan = Number(dr.dianggarkan) || 0;
          const realisasi = this._hitungRealisasi(dr.kode, transaksis, tahun);

          // Check if we need a pos subtotal
          const prefixParts = dr.kode.split('.');
          const posPrefix = prefixParts.slice(0, Math.min(3, prefixParts.length)).join('.');

          if (currentPosPrefix && posPrefix !== currentPosPrefix) {
            rowNum = this._writeSubtotal(ws, rowNum, 'Jumlah Pos ' + currentPosPrefix, posDianggarkan, posRealisasi, thinBorder, medBorder);
            posDianggarkan = 0;
            posRealisasi = 0;
          }
          currentPosPrefix = posPrefix;

          posDianggarkan += dianggarkan;
          posRealisasi += realisasi;
          subDianggarkan += dianggarkan;
          subRealisasi += realisasi;

          // Detail row
          const r = ws.getRow(rowNum);
          r.height = 16;

          // A: Kode
          const aCell = r.getCell(1);
          aCell.value = dr.kode;
          aCell.font = { name: 'Calibri', size: 11, color: { argb: COLORS.black } };
          aCell.alignment = { vertical: 'middle' };
          aCell.border = thinBorder;

          // B: Nama (indented)
          const bCell = r.getCell(2);
          bCell.value = indentText(dr.nama, dr.kode);
          bCell.font = { name: 'Calibri', size: 11, color: { argb: COLORS.black } };
          bCell.alignment = { vertical: 'middle', wrapText: true };
          bCell.border = thinBorder;

          // C: Dianggarkan
          const cCell = r.getCell(3);
          if (dianggarkan !== 0) { cCell.value = dianggarkan; cCell.numFmt = NUMBER_FORMAT_RP; }
          cCell.font = { name: 'Calibri', size: 11 };
          cCell.alignment = { horizontal: 'right', vertical: 'middle' };
          cCell.border = thinBorder;

          // D: Realisasi
          const dCell = r.getCell(4);
          if (realisasi !== 0) { dCell.value = realisasi; dCell.numFmt = NUMBER_FORMAT_RP; }
          dCell.font = { name: 'Calibri', size: 11 };
          dCell.alignment = { horizontal: 'right', vertical: 'middle' };
          dCell.border = thinBorder;

          // E: Selisih (formula) — matches reference: DIANGGARKAN - REALISASI
          const eCell = r.getCell(5);
          eCell.value = { formula: `C${rowNum}-D${rowNum}`, result: dianggarkan - realisasi };
          eCell.numFmt = NUMBER_FORMAT_RP;
          eCell.font = { name: 'Calibri', size: 11 };
          eCell.alignment = { horizontal: 'right', vertical: 'middle' };
          eCell.border = thinBorder;

          // F: Keterangan
          const fCell = r.getCell(6);
          fCell.value = '';
          fCell.border = thinBorder;

          rowNum++;
        });

        // Pos subtotal for last group
        if (currentPosPrefix) {
          rowNum = this._writeSubtotal(ws, rowNum, 'Jumlah Pos ' + currentPosPrefix, posDianggarkan, posRealisasi, thinBorder, medBorder);
        }
      });

      // Bagian subtotal
      grandDianggarkan += subDianggarkan;
      grandRealisasi += subRealisasi;
      rowNum = this._writeBagianSubtotal(ws, rowNum, 'Jumlah Bagian ' + sub.kode.replace(/\s+/g, '').replace(/\.$/, '') + '.', subDianggarkan, subRealisasi, thinBorder, medBorder);
    });

    // Grand total
    const tr = ws.getRow(rowNum);
    tr.height = 22;
    ws.mergeCells(rowNum, 1, rowNum, 2);
    const tLabel = ws.getCell(rowNum, 1);
    tLabel.value = 'TOTAL';
    this._applyStyle(tLabel, LEVEL_STYLES.GRANDTOTAL);
    tLabel.alignment = { horizontal: 'center', vertical: 'middle' };

    const tC = ws.getCell(rowNum, 3);
    tC.value = grandDianggarkan;
    tC.numFmt = NUMBER_FORMAT_RP;
    this._applyStyle(tC, LEVEL_STYLES.GRANDTOTAL);
    tC.alignment = { horizontal: 'right', vertical: 'middle' };

    const tD = ws.getCell(rowNum, 4);
    tD.value = grandRealisasi;
    tD.numFmt = NUMBER_FORMAT_RP;
    this._applyStyle(tD, LEVEL_STYLES.GRANDTOTAL);
    tD.alignment = { horizontal: 'right', vertical: 'middle' };

    const tE = ws.getCell(rowNum, 5);
    tE.value = { formula: `C${rowNum}-D${rowNum}`, result: grandDianggarkan - grandRealisasi };
    tE.numFmt = NUMBER_FORMAT_RP;
    this._applyStyle(tE, LEVEL_STYLES.GRANDTOTAL);
    tE.alignment = { horizontal: 'right', vertical: 'middle' };

    for (let c = 1; c <= 6; c++) {
      ws.getCell(rowNum, c).border = { top: { style: 'medium', color: { argb: '808080' } }, left: { style: 'thin', color: { argb: '808080' } }, bottom: { style: 'medium', color: { argb: '808080' } }, right: { style: 'thin', color: { argb: '808080' } } };
    }

    return rowNum + 1;
  }

  _hitungRealisasi(kode, transaksis, tahun) {
    if (!Array.isArray(transaksis)) return 0;
    const rows = transaksis.filter((r) => {
      if (new Date(r.tanggal).getFullYear() !== tahun) return false;
      return String(r.kodeAnggaran || '') === kode;
    });
    return rows.reduce((s, r) => s + Number(r.penerimaan || 0) + Number(r.pengeluaran || 0), 0);
  }

  _writeSubtotal(ws, rowNum, label, dianggarkan, realisasi, thinBorder, medBorder) {
    const r = ws.getRow(rowNum);
    r.height = 20;
    ws.mergeCells(rowNum, 1, rowNum, 2);

    const lCell = ws.getCell(rowNum, 1);
    lCell.value = label;
    this._applyStyle(lCell, LEVEL_STYLES.SUBTOTAL);
    lCell.alignment = { horizontal: 'left', vertical: 'middle' };

    const cCell = ws.getCell(rowNum, 3);
    cCell.value = dianggarkan;
    cCell.numFmt = NUMBER_FORMAT_RP;
    this._applyStyle(cCell, LEVEL_STYLES.SUBTOTAL);
    cCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const dCell = ws.getCell(rowNum, 4);
    dCell.value = realisasi;
    dCell.numFmt = NUMBER_FORMAT_RP;
    this._applyStyle(dCell, LEVEL_STYLES.SUBTOTAL);
    dCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const eCell = ws.getCell(rowNum, 5);
    eCell.value = { formula: `C${rowNum}-D${rowNum}`, result: dianggarkan - realisasi };
    eCell.numFmt = NUMBER_FORMAT_RP;
    this._applyStyle(eCell, LEVEL_STYLES.SUBTOTAL);
    eCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const fCell = ws.getCell(rowNum, 6);
    fCell.border = thinBorder;

    for (let c = 1; c <= 6; c++) {
      ws.getCell(rowNum, c).border = { top: thinBorder, left: thinBorder, bottom: medBorder, right: thinBorder };
    }

    return rowNum + 1;
  }

  _writeBagianSubtotal(ws, rowNum, label, dianggarkan, realisasi, thinBorder, medBorder) {
    const r = ws.getRow(rowNum);
    r.height = 22;
    ws.mergeCells(rowNum, 1, rowNum, 2);

    const lCell = ws.getCell(rowNum, 1);
    lCell.value = label;
    this._applyStyle(lCell, LEVEL_STYLES.BAGIAN_SUBTOTAL);
    lCell.alignment = { horizontal: 'left', vertical: 'middle' };

    const cCell = ws.getCell(rowNum, 3);
    cCell.value = dianggarkan;
    cCell.numFmt = NUMBER_FORMAT_RP;
    this._applyStyle(cCell, LEVEL_STYLES.BAGIAN_SUBTOTAL);
    cCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const dCell = ws.getCell(rowNum, 4);
    dCell.value = realisasi;
    dCell.numFmt = NUMBER_FORMAT_RP;
    this._applyStyle(dCell, LEVEL_STYLES.BAGIAN_SUBTOTAL);
    dCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const eCell = ws.getCell(rowNum, 5);
    eCell.value = { formula: `C${rowNum}-D${rowNum}`, result: dianggarkan - realisasi };
    eCell.numFmt = NUMBER_FORMAT_RP;
    this._applyStyle(eCell, LEVEL_STYLES.BAGIAN_SUBTOTAL);
    eCell.alignment = { horizontal: 'right', vertical: 'middle' };

    for (let c = 1; c <= 6; c++) {
      ws.getCell(rowNum, c).border = { top: thinBorder, left: thinBorder, bottom: medBorder, right: thinBorder };
    }

    return rowNum + 1;
  }

  _applyStyle(cell, style) {
    if (style.font) cell.font = style.font;
    if (style.fill) cell.fill = style.fill;
  }
}

module.exports = { BatangTubuhExportService };
