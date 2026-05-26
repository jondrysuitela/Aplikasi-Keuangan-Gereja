const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const MONTH_COLUMNS = [3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
const SEMESTER_I_COL = 9;
const SEMESTER_II_COL = 16;
const TOTAL_COL = 17;
const TEMPLATE_NAME = 'APLIKASI KEUANGAN TAHUN 2025 FINAL.xlsx';
const THEME = {
  navy: '1F3864',
  blue: '2563EB',
  green: '059669',
  red: 'DC2626',
  amber: 'D97706',
  slate: '475569',
  lightBlue: 'EAF2FF',
  lightGreen: 'ECFDF5',
  lightRed: 'FEF2F2',
  lightAmber: 'FFFBEB',
  lightSlate: 'F8FAFC',
  border: 'CBD5E1',
  white: 'FFFFFF',
};

function normalizeKode(kode) {
  return String(kode || '').replace(/\s+/g, '').replace(/\.+$/, '');
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function setValue(cell, value) {
  cell.value = value;
}

function safeUnmerge(ws, address) {
  try {
    ws.unMergeCells(address);
  } catch (_) {
    // The reference file sometimes has complex merged ranges. Ignore if absent.
  }
}

class FullWorkbookExportService {
  constructor(options = {}) {
    this.templatePaths = options.templatePaths || [];
  }

  async export(config = {}) {
    const templatePath = this._resolveTemplatePath();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const tahun = Number(config.tahun || new Date().getFullYear());
    const rows = this._normalizeRows(config.doorscrieftTransaksis || [], tahun);
    const kodeAnggarans = config.kodeAnggarans || [];
    const subSeksis = config.subSeksis || [];
    const batangTubuhs = config.batangTubuhs || [];

    workbook.creator = 'Aplikasi Keuangan Gereja';
    workbook.modified = new Date();

    this._updateTitles(workbook, {
      tahun,
      jemaat: config.namaJemaat || 'JEMAAT GPM SULI',
      klas: config.klasis || 'KLASIS PULAU AMBON TIMUR',
    });
    this._removeLegacyTemplateSheets(workbook);
    this._writeDoorscrieft(workbook.getWorksheet('DOORSCRIEFT2'), rows);
    this._writeDatabase(workbook, kodeAnggarans);
    this._writeDashboardSheet(workbook, rows, tahun);
    this._writePerbulanDetailSheet(workbook, 'PENDAPATAN PERBULAN', rows, kodeAnggarans, 'penerimaan', 'I.', tahun);
    this._writePerbulanDetailSheet(workbook, 'PENGELUARAN PERBULAN', rows, kodeAnggarans, 'pengeluaran', 'II.', tahun);
    this._writeKomponenSheet(workbook, 'KOMPONEN PENDAPATAN', rows, kodeAnggarans, 'penerimaan', 'I.', tahun);
    this._writeKomponenSheet(workbook, 'KOMPONEN PENGELUARAN', rows, kodeAnggarans, 'pengeluaran', 'II.', tahun);
    this._writeRekonsiliasiSheet(workbook, rows, kodeAnggarans, tahun);
    this._writeRealisasiPerbulan(workbook.getWorksheet('REALISASI PERBULAN'), rows, tahun);
    this._writeSubSeksiDetailSheet(workbook, rows, subSeksis, tahun);
    this._writeBatangTubuhDetailSheet(workbook, rows, batangTubuhs, tahun);
    this._writePengaturanSheet(workbook, config, rows, kodeAnggarans, subSeksis, batangTubuhs, tahun);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  _resolveTemplatePath() {
    const found = this.templatePaths.find((candidate) => candidate && fs.existsSync(candidate));
    if (!found) {
      throw new Error(`Template Excel tidak ditemukan: ${TEMPLATE_NAME}`);
    }
    return found;
  }

  _removeLegacyTemplateSheets(workbook) {
    [
      'BATANG TUBUH2',
      'BELANJA PERBULAN',
      'KOMP. BELANJA',
      'KOMP. PENDAPATAN',
      'REKON',
      'DATA BASE',
      'MATA ANGGARAN PENDAPATAN',
      'MATA ANGGARAN PENGELUARAN',
      'SUB SEKSI PENDAPATAN',
      'SUB SEKSI PENGELUARAN',
    ].forEach((name) => {
      const sheet = workbook.getWorksheet(name);
      if (sheet) workbook.removeWorksheet(sheet.id);
    });
  }

  _normalizeRows(rows, tahun) {
    return rows
      .map((row) => {
        const tanggal = toDate(row.tanggal);
        return {
          ...row,
          tanggal,
          kodeAnggaran: normalizeKode(row.kodeAnggaran),
          penerimaan: toNumber(row.penerimaan),
          pengeluaran: toNumber(row.pengeluaran),
        };
      })
      .filter((row) => row.tanggal && row.tanggal.getFullYear() === tahun)
      .sort((a, b) => a.tanggal - b.tanggal || String(a.no || '').localeCompare(String(b.no || ''), undefined, { numeric: true }));
  }

  _updateTitles(workbook, { tahun, jemaat, klas }) {
    const yearPattern = /(TAHUN(?: ANGGARAN)?|TA)\s+\d{4}|\b20\d{2}\b/gi;
    workbook.worksheets.forEach((ws) => {
      for (let rowNum = 1; rowNum <= Math.min(ws.rowCount || 0, 8); rowNum++) {
        const row = ws.getRow(rowNum);
        row.eachCell((cell) => {
          if (typeof cell.value !== 'string') return;
          if (/JEMAAT/i.test(cell.value)) cell.value = jemaat;
          if (/KLASIS/i.test(cell.value)) cell.value = klas;
          if (/TAHUN|TA\s+\d{4}|20\d{2}/i.test(cell.value)) {
            cell.value = cell.value.replace(yearPattern, (match) => {
              if (/^20\d{2}$/.test(match)) return String(tahun);
              return match.replace(/\d{4}/, String(tahun));
            });
          }
        });
      }
    });
  }

  _writeDoorscrieft(ws, rows) {
    if (!ws) return;
    const startRow = 2;
    const lastRow = Math.max(ws.rowCount, startRow + rows.length + 20);

    for (let r = startRow; r <= lastRow; r++) {
      for (let c = 1; c <= 7; c++) ws.getCell(r, c).value = null;
    }

    rows.forEach((row, index) => {
      const r = startRow + index;
      const excelRow = ws.getRow(r);
      excelRow.getCell(1).value = { formula: `E${r}&COUNTIFS($E$2:E${r},E${r})` };
      excelRow.getCell(2).value = row.no || index + 1;
      excelRow.getCell(3).value = row.tanggal;
      excelRow.getCell(4).value = row.uraian || '';
      excelRow.getCell(5).value = row.kodeAnggaran || '';
      excelRow.getCell(6).value = row.penerimaan || null;
      excelRow.getCell(7).value = row.pengeluaran || null;
    });
  }

  _writeDatabase(workbook, kodeAnggarans) {
    const db = workbook.getWorksheet('DATA BASE2');
    if (!db || !Array.isArray(kodeAnggarans) || kodeAnggarans.length === 0) return;
    for (let r = 2; r <= Math.max(db.rowCount, kodeAnggarans.length + 2); r++) {
      db.getCell(r, 1).value = null;
      db.getCell(r, 2).value = null;
    }
    kodeAnggarans.forEach((item, index) => {
      db.getCell(index + 2, 1).value = normalizeKode(item.kodeAnggaran);
      db.getCell(index + 2, 2).value = item.mataAnggaran || '';
    });
  }

  _writePerbulan(ws, rows, amountKey, prefix, tahun) {
    if (!ws) return;
    for (let r = 1; r <= ws.rowCount; r++) {
      const kode = normalizeKode(ws.getCell(r, 1).value);
      if (!kode || !kode.startsWith(prefix)) continue;

      MONTH_COLUMNS.forEach((col, monthIndex) => {
        const total = rows
          .filter((row) => row.tanggal.getMonth() === monthIndex && row.kodeAnggaran.startsWith(kode))
          .reduce((sum, row) => sum + toNumber(row[amountKey]), 0);
        setValue(ws.getCell(r, col), total || null);
      });

      setValue(ws.getCell(r, SEMESTER_I_COL), { formula: `SUM(C${r}:H${r})` });
      setValue(ws.getCell(r, SEMESTER_II_COL), { formula: `SUM(J${r}:O${r})` });
      setValue(ws.getCell(r, TOTAL_COL), { formula: `I${r}+P${r}` });
    }

    ws.getRow(4).eachCell((cell) => {
      if (typeof cell.value === 'string') cell.value = cell.value.replace(/\b20\d{2}\b/g, String(tahun));
    });
  }

  _ensureSheet(workbook, name, tabColor = THEME.navy) {
    const existing = workbook.getWorksheet(name);
    if (existing) workbook.removeWorksheet(existing.id);
    const ws = workbook.addWorksheet(name, {
      properties: { tabColor: { argb: tabColor } },
      pageSetup: {
        orientation: 'landscape',
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
      },
    });
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    return ws;
  }

  _title(ws, title, subtitle, colCount, accent = THEME.navy) {
    ws.mergeCells(1, 1, 1, colCount);
    ws.getCell(1, 1).value = title;
    ws.getCell(1, 1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: THEME.white } };
    ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
    ws.getCell(1, 1).alignment = { horizontal: 'center' };
    ws.getRow(1).height = 24;

    ws.mergeCells(2, 1, 2, colCount);
    ws.getCell(2, 1).value = subtitle;
    ws.getCell(2, 1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: accent } };
    ws.getCell(2, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EFF6FF' } };
    ws.getCell(2, 1).alignment = { horizontal: 'center' };
    ws.getRow(2).height = 20;
    ws.addRow([]);
  }

  _styleHeader(row, accent = THEME.navy) {
    row.height = 24;
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: THEME.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = this._thinBorder();
    });
  }

  _thinBorder() {
    return {
      top: { style: 'thin', color: { argb: THEME.border } },
      left: { style: 'thin', color: { argb: THEME.border } },
      bottom: { style: 'thin', color: { argb: THEME.border } },
      right: { style: 'thin', color: { argb: THEME.border } },
    };
  }

  _formatBody(ws, startRow, endRow, moneyColumns = []) {
    for (let r = startRow; r <= endRow; r++) {
      const row = ws.getRow(r);
      row.height = Math.max(row.height || 0, 19);
      row.eachCell((cell) => {
        if (!cell.font || Object.keys(cell.font).length === 0) {
          cell.font = { name: 'Calibri', size: 10, color: { argb: '0F172A' } };
        }
        cell.border = this._thinBorder();
        cell.alignment = { vertical: 'top', wrapText: true };
        if ((!cell.fill || Object.keys(cell.fill).length === 0) && r % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.lightSlate } };
        }
      });
      moneyColumns.forEach((col) => {
        const cell = row.getCell(col);
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'top' };
      });
    }
  }

  _sectionRow(ws, label, colCount, accent = THEME.slate) {
    const row = ws.addRow([label]);
    ws.mergeCells(row.number, 1, row.number, colCount);
    row.height = 22;
    const cell = ws.getCell(row.number, 1);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    cell.border = this._thinBorder();
    return row;
  }

  _styleTotalRow(row, moneyColumns = [], fill = 'E2E8F0') {
    row.height = 22;
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.border = this._thinBorder();
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    moneyColumns.forEach((col) => {
      const cell = row.getCell(col);
      cell.numFmt = '#,##0';
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
  }

  _applySheetPolish(ws) {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (!cell.font) cell.font = { name: 'Calibri', size: 10 };
      });
    });
    ws.pageSetup.printTitlesRows = '1:4';
  }

  _kodeLabel(row, kodeAnggarans) {
    const kode = normalizeKode(row.kodeAnggaran);
    const master = (kodeAnggarans || []).find((item) => normalizeKode(item.kodeAnggaran) === kode);
    return master?.mataAnggaran || row.mataAnggaran || kode;
  }

  _kodeGroups(rows, kodeAnggarans, amountKey, prefix) {
    const groups = new Map();
    rows
      .filter((row) => row.kodeAnggaran.startsWith(prefix) && toNumber(row[amountKey]) !== 0)
      .forEach((row) => {
        const kode = normalizeKode(row.kodeAnggaran);
        if (!groups.has(kode)) {
          groups.set(kode, {
            kode,
            mataAnggaran: this._kodeLabel(row, kodeAnggarans),
            rows: [],
            monthly: Array(12).fill(0),
            total: 0,
          });
        }
        const group = groups.get(kode);
        const amount = toNumber(row[amountKey]);
        group.rows.push(row);
        group.monthly[row.tanggal.getMonth()] += amount;
        group.total += amount;
      });
    return Array.from(groups.values()).sort((a, b) => a.kode.localeCompare(b.kode, undefined, { numeric: true }));
  }

  _writeDashboardSheet(workbook, rows, tahun) {
    const ws = this._ensureSheet(workbook, 'DASHBOARD', THEME.blue);
    ws.columns = [
      { width: 24 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 28 },
    ];
    this._title(ws, `DASHBOARD KEUANGAN ${tahun}`, 'Ringkasan otomatis dari data Doorscrieft', 6, THEME.blue);

    const totalP = rows.reduce((sum, row) => sum + row.penerimaan, 0);
    const totalQ = rows.reduce((sum, row) => sum + row.pengeluaran, 0);
    const saldo = totalP - totalQ;
    ws.addRow(['Total Pemasukan', totalP, 'Total Pengeluaran', totalQ, 'Saldo Akhir', saldo]);
    this._formatBody(ws, 4, 4, [2, 4, 6]);
    ws.getRow(4).eachCell((cell, col) => {
      cell.font = { name: 'Calibri', size: col % 2 === 1 ? 10 : 12, bold: true, color: { argb: col % 2 === 1 ? THEME.slate : THEME.navy } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col % 2 === 1 ? 'E2E8F0' : 'DBEAFE' } };
      cell.alignment = { horizontal: col % 2 === 1 ? 'left' : 'right', vertical: 'middle' };
    });
    ws.addRow([]);

    this._sectionRow(ws, 'ARUS KAS PER BULAN', 6, THEME.blue);
    const header = ws.addRow(['Bulan', 'Pemasukan', 'Pengeluaran', 'Saldo Bulanan', 'Jumlah Transaksi', 'Catatan']);
    this._styleHeader(header, THEME.blue);
    for (let month = 0; month < 12; month++) {
      const monthRows = rows.filter((row) => row.tanggal.getMonth() === month);
      const p = monthRows.reduce((sum, row) => sum + row.penerimaan, 0);
      const q = monthRows.reduce((sum, row) => sum + row.pengeluaran, 0);
      ws.addRow([MONTHS[month], p, q, p - q, monthRows.length, '']);
    }
    this._formatBody(ws, 8, 19, [2, 3, 4]);

    ws.addRow([]);
    this._sectionRow(ws, 'KODE ANGGARAN TERBESAR', 6, THEME.slate);
    const topHeader = ws.addRow(['Top Kode Pengeluaran', 'Mata Anggaran', 'Total', '', 'Top Kode Pemasukan', 'Total']);
    this._styleHeader(topHeader, THEME.slate);
    const topQ = this._kodeGroups(rows, [], 'pengeluaran', 'II.').sort((a, b) => b.total - a.total).slice(0, 10);
    const topP = this._kodeGroups(rows, [], 'penerimaan', 'I.').sort((a, b) => b.total - a.total).slice(0, 10);
    for (let i = 0; i < 10; i++) {
      ws.addRow([
        topQ[i]?.kode || '',
        topQ[i]?.mataAnggaran || '',
        topQ[i]?.total || null,
        '',
        topP[i] ? `${topP[i].kode} - ${topP[i].mataAnggaran}` : '',
        topP[i]?.total || null,
      ]);
    }
    this._formatBody(ws, 23, 32, [3, 6]);
    this._applySheetPolish(ws);
  }

  _writePerbulanDetailSheet(workbook, sheetName, rows, kodeAnggarans, amountKey, prefix, tahun) {
    const accent = amountKey === 'penerimaan' ? THEME.green : THEME.red;
    const ws = this._ensureSheet(workbook, sheetName, accent);
    ws.columns = [
      { width: 18 }, { width: 38 },
      ...Array.from({ length: 12 }, () => ({ width: 14 })),
      { width: 16 }, { width: 14 },
    ];
    this._title(ws, `${sheetName} ${tahun}`, 'Rekap per bulan berdasarkan Kode Anggaran dari Doorscrieft', 16, accent);

    this._sectionRow(ws, 'REKAP PER KODE ANGGARAN', 16, accent);
    const header = ws.addRow(['Kode Anggaran', 'Mata Anggaran', ...MONTHS, 'Total', 'Jumlah Trx']);
    this._styleHeader(header, accent);
    const groups = this._kodeGroups(rows, kodeAnggarans, amountKey, prefix);
    groups.forEach((group) => {
      ws.addRow([group.kode, group.mataAnggaran, ...group.monthly, group.total, group.rows.length]);
    });
    const totalRow = ws.addRow(['TOTAL', '', ...Array.from({ length: 12 }, (_, i) => groups.reduce((sum, group) => sum + group.monthly[i], 0)), groups.reduce((sum, group) => sum + group.total, 0), groups.reduce((sum, group) => sum + group.rows.length, 0)]);
    this._styleTotalRow(totalRow, Array.from({ length: 13 }, (_, i) => i + 3), amountKey === 'penerimaan' ? THEME.lightGreen : THEME.lightRed);
    this._formatBody(ws, 6, ws.rowCount - 1, Array.from({ length: 13 }, (_, i) => i + 3));

    ws.addRow([]);
    this._sectionRow(ws, 'DETAIL TRANSAKSI', 6, accent);
    const detailHeader = ws.addRow(['No', 'Tanggal', 'Kode Anggaran', 'Mata Anggaran', 'Uraian', amountKey === 'penerimaan' ? 'Penerimaan' : 'Pengeluaran']);
    this._styleHeader(detailHeader, accent);
    rows
      .filter((row) => row.kodeAnggaran.startsWith(prefix) && toNumber(row[amountKey]) !== 0)
      .forEach((row) => ws.addRow([row.no || '', row.tanggal, row.kodeAnggaran, this._kodeLabel(row, kodeAnggarans), row.uraian || '', row[amountKey]]));
    ws.getColumn(2).numFmt = 'dd mmmm yyyy';
    this._formatBody(ws, detailHeader.number + 1, ws.rowCount, [6]);
    this._applySheetPolish(ws);
  }

  _writeKomponenSheet(workbook, sheetName, rows, kodeAnggarans, amountKey, prefix, tahun) {
    const accent = amountKey === 'penerimaan' ? THEME.green : THEME.red;
    const ws = this._ensureSheet(workbook, sheetName, accent);
    ws.columns = [
      { width: 18 }, { width: 42 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 },
      { width: 16 }, { width: 40 }, { width: 18 },
    ];
    this._title(ws, `${sheetName} ${tahun}`, 'Detail transaksi per mata anggaran', 9, accent);

    this._sectionRow(ws, 'RINGKASAN MATA ANGGARAN', 9, accent);
    const header = ws.addRow(['Kode Anggaran', 'Mata Anggaran', 'Total', 'Jumlah Trx', 'Rata-rata', 'Terakhir', 'No', 'Uraian Terakhir', 'Nilai Terakhir']);
    this._styleHeader(header, accent);
    const groups = this._kodeGroups(rows, kodeAnggarans, amountKey, prefix);
    groups.forEach((group) => {
      const sorted = [...group.rows].sort((a, b) => b.tanggal - a.tanggal || String(b.no || '').localeCompare(String(a.no || ''), undefined, { numeric: true }));
      const latest = sorted[0];
      ws.addRow([
        group.kode,
        group.mataAnggaran,
        group.total,
        group.rows.length,
        group.rows.length ? group.total / group.rows.length : 0,
        latest?.tanggal || null,
        latest?.no || '',
        latest?.uraian || '',
        latest ? latest[amountKey] : null,
      ]);
    });
    this._formatBody(ws, 6, ws.rowCount, [3, 5, 9]);
    ws.getColumn(6).numFmt = 'dd mmmm yyyy';

    ws.addRow([]);
    this._sectionRow(ws, 'RINCIAN TRANSAKSI', 7, accent);
    const detailHeader = ws.addRow(['Kode Anggaran', 'Mata Anggaran', 'No', 'Tanggal', 'Uraian', 'Penerimaan', 'Pengeluaran']);
    this._styleHeader(detailHeader, accent);
    groups.forEach((group) => {
      group.rows
        .sort((a, b) => a.tanggal - b.tanggal || String(a.no || '').localeCompare(String(b.no || ''), undefined, { numeric: true }))
        .forEach((row) => ws.addRow([group.kode, group.mataAnggaran, row.no || '', row.tanggal, row.uraian || '', row.penerimaan || null, row.pengeluaran || null]));
    });
    ws.getColumn(4).numFmt = 'dd mmmm yyyy';
    this._formatBody(ws, detailHeader.number + 1, ws.rowCount, [6, 7]);
    this._applySheetPolish(ws);
  }

  _writeRekonsiliasiSheet(workbook, rows, kodeAnggarans, tahun) {
    const ws = this._ensureSheet(workbook, 'REKONSILIASI', THEME.amber);
    ws.columns = [
      { width: 16 }, { width: 18 }, { width: 40 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 16 },
    ];
    this._title(ws, `REKONSILIASI ${tahun}`, 'Perbandingan pemasukan dan pengeluaran per bulan serta kode anggaran', 7, THEME.amber);

    this._sectionRow(ws, 'REKAP PER BULAN', 7, THEME.amber);
    const monthHeader = ws.addRow(['Bulan', 'Pemasukan', 'Pengeluaran', 'Saldo', 'Jumlah Trx Masuk', 'Jumlah Trx Keluar', 'Status']);
    this._styleHeader(monthHeader, THEME.amber);
    for (let month = 0; month < 12; month++) {
      const monthRows = rows.filter((row) => row.tanggal.getMonth() === month);
      const p = monthRows.reduce((sum, row) => sum + row.penerimaan, 0);
      const q = monthRows.reduce((sum, row) => sum + row.pengeluaran, 0);
      ws.addRow([MONTHS[month], p, q, p - q, monthRows.filter((r) => r.penerimaan !== 0).length, monthRows.filter((r) => r.pengeluaran !== 0).length, p - q >= 0 ? 'Saldo Positif' : 'Saldo Negatif']);
    }
    this._formatBody(ws, 6, 17, [2, 3, 4]);

    ws.addRow([]);
    this._sectionRow(ws, 'REKAP PER KODE ANGGARAN', 7, THEME.slate);
    const kodeHeader = ws.addRow(['Kode Anggaran', 'Mata Anggaran', 'Pemasukan', 'Pengeluaran', 'Saldo', 'Jumlah Trx', 'Jenis Dominan']);
    this._styleHeader(kodeHeader, THEME.slate);
    const map = new Map();
    rows.forEach((row) => {
      const kode = normalizeKode(row.kodeAnggaran);
      if (!kode) return;
      if (!map.has(kode)) {
        map.set(kode, { kode, mataAnggaran: this._kodeLabel(row, kodeAnggarans), p: 0, q: 0, count: 0 });
      }
      const entry = map.get(kode);
      entry.p += row.penerimaan;
      entry.q += row.pengeluaran;
      entry.count += 1;
    });
    Array.from(map.values()).sort((a, b) => a.kode.localeCompare(b.kode, undefined, { numeric: true })).forEach((entry) => {
      ws.addRow([entry.kode, entry.mataAnggaran, entry.p, entry.q, entry.p - entry.q, entry.count, entry.p >= entry.q ? 'Pemasukan' : 'Pengeluaran']);
    });
    this._formatBody(ws, kodeHeader.number + 1, ws.rowCount, [3, 4, 5]);
    this._applySheetPolish(ws);
  }

  _writeSubSeksiDetailSheet(workbook, rows, subSeksis, tahun) {
    const ws = this._ensureSheet(workbook, 'SUB SEKSI', THEME.blue);
    ws.columns = [
      { width: 18 }, { width: 42 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 },
    ];
    this._title(ws, `SUB SEKSI ${tahun}`, 'Rekap sub seksi berdasarkan prefix Kode Anggaran dari Doorscrieft', 7, THEME.blue);
    this._sectionRow(ws, 'REKAP SUB SEKSI', 7, THEME.blue);
    const header = ws.addRow(['Kode', 'Nama', 'Penerimaan', 'Pengeluaran', 'Saldo', 'Jumlah Trx', 'Jenis']);
    this._styleHeader(header, THEME.blue);

    const source = Array.isArray(subSeksis) ? subSeksis : [];
    source.forEach((sub) => {
      const children = sub.anak?.length ? sub.anak : [{ kode: sub.kode, nama: sub.nama }];
      const subRows = rows.filter((row) => children.some((child) => row.kodeAnggaran.startsWith(normalizeKode(child.kode))));
      const p = subRows.reduce((sum, row) => sum + row.penerimaan, 0);
      const q = subRows.reduce((sum, row) => sum + row.pengeluaran, 0);
      ws.addRow([normalizeKode(sub.kode), sub.nama || '', p, q, p - q, subRows.length, normalizeKode(sub.kode).startsWith('II.') ? 'Pengeluaran' : 'Pendapatan']);
      children.forEach((child) => {
        if (normalizeKode(child.kode) === normalizeKode(sub.kode)) return;
        const childRows = rows.filter((row) => row.kodeAnggaran.startsWith(normalizeKode(child.kode)));
        const cp = childRows.reduce((sum, row) => sum + row.penerimaan, 0);
        const cq = childRows.reduce((sum, row) => sum + row.pengeluaran, 0);
        ws.addRow([normalizeKode(child.kode), `  ${child.nama || ''}`, cp, cq, cp - cq, childRows.length, normalizeKode(child.kode).startsWith('II.') ? 'Pengeluaran' : 'Pendapatan']);
      });
    });
    this._formatBody(ws, 6, ws.rowCount, [3, 4, 5]);

    ws.addRow([]);
    this._sectionRow(ws, 'DETAIL TRANSAKSI SUB SEKSI', 8, THEME.slate);
    const detailHeader = ws.addRow(['Kode Sub Seksi', 'No', 'Tanggal', 'Kode Anggaran', 'Mata Anggaran', 'Uraian', 'Penerimaan', 'Pengeluaran']);
    this._styleHeader(detailHeader, THEME.slate);
    rows.forEach((row) => {
      const sub = source.find((item) => row.kodeAnggaran.startsWith(normalizeKode(item.kode)) || (item.anak || []).some((child) => row.kodeAnggaran.startsWith(normalizeKode(child.kode))));
      ws.addRow([sub ? normalizeKode(sub.kode) : '', row.no || '', row.tanggal, row.kodeAnggaran, row.mataAnggaran || '', row.uraian || '', row.penerimaan || null, row.pengeluaran || null]);
    });
    ws.getColumn(3).numFmt = 'dd mmmm yyyy';
    this._formatBody(ws, detailHeader.number + 1, ws.rowCount, [7, 8]);
    this._applySheetPolish(ws);
  }

  _writeBatangTubuhDetailSheet(workbook, rows, batangTubuhs, tahun) {
    const ws = this._ensureSheet(workbook, 'BATANG TUBUH', THEME.navy);
    ws.columns = [
      { width: 18 }, { width: 46 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 },
    ];
    this._title(ws, `BATANG TUBUH ${tahun}`, 'Dianggarkan dan realisasi dari Doorscrieft per kode anggaran', 7, THEME.navy);
    this._sectionRow(ws, 'ANGGARAN DAN REALISASI', 7, THEME.navy);
    const header = ws.addRow(['Kode Anggaran', 'Mata Anggaran', 'Sub Seksi', 'Dianggarkan', 'Realisasi', 'Lebih/Kurang', 'Jumlah Trx']);
    this._styleHeader(header, THEME.navy);

    const source = Array.isArray(batangTubuhs) ? batangTubuhs : [];
    source.forEach((bt) => {
      ws.addRow([normalizeKode(bt.kode), bt.nama || '', bt.subSeksiNama || '', '', '', '', '']);
      const parentRow = ws.getRow(ws.rowCount);
      this._styleTotalRow(parentRow, [4, 5, 6], 'E2E8F0');
      (bt.detailRows || []).forEach((detail) => {
        const kode = normalizeKode(detail.kode);
        const detailRows = rows.filter((row) => row.kodeAnggaran === kode);
        const realisasi = detailRows.reduce((sum, row) => sum + row.penerimaan + row.pengeluaran, 0);
        const dianggarkan = toNumber(detail.dianggarkan);
        ws.addRow([kode, detail.nama || '', bt.subSeksiNama || '', dianggarkan || null, realisasi || null, dianggarkan - realisasi, detailRows.length]);
      });
    });
    this._formatBody(ws, 6, ws.rowCount, [4, 5, 6]);
    this._applySheetPolish(ws);
  }

  _writePengaturanSheet(workbook, config, rows, kodeAnggarans, subSeksis, batangTubuhs, tahun) {
    const ws = this._ensureSheet(workbook, 'PENGATURAN', THEME.slate);
    ws.columns = [{ width: 30 }, { width: 54 }];
    this._title(ws, `PENGATURAN EXPORT ${tahun}`, 'Snapshot identitas aplikasi dan sumber data export', 2, THEME.slate);

    this._sectionRow(ws, 'IDENTITAS DAN RINGKASAN EXPORT', 2, THEME.slate);
    const header = ws.addRow(['Item', 'Nilai']);
    this._styleHeader(header, THEME.slate);
    const totalP = rows.reduce((sum, row) => sum + row.penerimaan, 0);
    const totalQ = rows.reduce((sum, row) => sum + row.pengeluaran, 0);
    [
      ['Nama Aplikasi', config.appName || 'Aplikasi Keuangan'],
      ['Subjudul Aplikasi', config.appSubtitle || ''],
      ['Nama Gereja', config.namaGereja || 'Gereja Protestan Maluku'],
      ['Klasis', config.klasis || 'KLASIS PULAU AMBON TIMUR'],
      ['Jemaat', config.namaJemaat || 'JEMAAT GPM SULI'],
      ['Tahun Export', tahun],
      ['Tanggal Export', new Date()],
      ['Jumlah Transaksi Doorscrieft', rows.length],
      ['Jumlah Kode Anggaran Master', Array.isArray(kodeAnggarans) ? kodeAnggarans.length : 0],
      ['Jumlah Sub Seksi', Array.isArray(subSeksis) ? subSeksis.length : 0],
      ['Jumlah Batang Tubuh', Array.isArray(batangTubuhs) ? batangTubuhs.length : 0],
      ['Total Pemasukan', totalP],
      ['Total Pengeluaran', totalQ],
      ['Saldo Akhir', totalP - totalQ],
    ].forEach((row) => ws.addRow(row));
    ws.getColumn(2).numFmt = '#,##0';
    ws.getCell(11, 2).numFmt = 'dd mmmm yyyy hh:mm';
    this._formatBody(ws, 6, ws.rowCount, [2]);
    this._applySheetPolish(ws);
  }

  _writeRealisasiPerbulan(ws, rows, tahun) {
    if (!ws) return;
    for (let i = 0; i < 12; i++) {
      const r = 11 + i;
      ws.getCell(r, 1).value = i + 1;
      ws.getCell(r, 2).value = `${MONTHS[i]} ${tahun}`;
      ws.getCell(r, 3).value = this._monthTotal(rows, i, 'penerimaan');
      ws.getCell(r, 4).value = this._monthTotal(rows, i, 'pengeluaran');
      ws.getCell(r, 5).value = 0;
      ws.getCell(r, 6).value = 0;
    }
  }

  _writeSubSeksi(ws, rows, subSeksis) {
    if (!ws || !Array.isArray(subSeksis) || subSeksis.length === 0) return;
    safeUnmerge(ws, 'A10:J200');

    let r = 10;
    let no = 1;
    for (let i = r; i <= Math.max(ws.rowCount, 80); i++) {
      for (let c = 1; c <= 10; c++) ws.getCell(i, c).value = null;
    }

    subSeksis.forEach((sub) => {
      r = this._writeSubSeksiLine(ws, r, no++, sub.kode, sub.nama, rows, true);
      (sub.batangTubuh || []).forEach((bt) => {
        r = this._writeSubSeksiLine(ws, r, no++, bt.kode, bt.nama, rows, false);
      });
    });
  }

  _writeSubSeksiLine(ws, r, no, kode, nama, rows, bold) {
    const cleaned = normalizeKode(kode);
    const pSem1 = this._sumByKode(rows, cleaned, 'penerimaan', 0, 5);
    const pSem2 = this._sumByKode(rows, cleaned, 'penerimaan', 6, 11);
    const qSem1 = this._sumByKode(rows, cleaned, 'pengeluaran', 0, 5);
    const qSem2 = this._sumByKode(rows, cleaned, 'pengeluaran', 6, 11);
    const values = [no, cleaned, nama || '', pSem1, pSem2, pSem1 + pSem2, qSem1, qSem2, qSem1 + qSem2, ''];
    values.forEach((value, idx) => {
      const cell = ws.getCell(r, idx + 1);
      cell.value = value || (idx > 2 ? null : value);
      if (bold) cell.font = { ...(cell.font || {}), bold: true };
    });
    return r + 1;
  }

  _writeBatangTubuh(ws, rows, batangTubuhs, tahun) {
    if (!ws || !Array.isArray(batangTubuhs) || batangTubuhs.length === 0) return;
    const detailByKode = new Map();
    batangTubuhs.forEach((item) => {
      if (Array.isArray(item.detailRows)) {
        item.detailRows.forEach((detail) => detailByKode.set(normalizeKode(detail.kode), detail));
      }

      (item.batangTubuh || []).forEach((bt) => {
        (bt.detailRows || []).forEach((detail) => detailByKode.set(normalizeKode(detail.kode), detail));
      });
    });

    for (let r = 10; r <= ws.rowCount; r++) {
      const kode = normalizeKode(ws.getCell(r, 1).value);
      if (!kode) continue;
      const detail = detailByKode.get(kode);
      const dianggarkan = detail ? toNumber(detail.dianggarkan) : toNumber(ws.getCell(r, 3).value);
      const realisasi = this._sumByKode(rows, kode, kode.startsWith('II.') ? 'pengeluaran' : 'penerimaan', 0, 11);
      ws.getCell(r, 3).value = dianggarkan || null;
      ws.getCell(r, 4).value = realisasi || null;
      ws.getCell(r, 5).value = { formula: `C${r}-D${r}` };
    }

    ws.getCell(7, 3).value = `DIANGGARKAN ${tahun}`;
    ws.getCell(7, 4).value = `REALISASI ${tahun}`;
    ws.getCell(8, 3).value = `DIANGGARKAN ${tahun}`;
    ws.getCell(8, 4).value = `REALISASI ${tahun}`;
  }

  _monthTotal(rows, month, key) {
    return rows
      .filter((row) => row.tanggal.getMonth() === month)
      .reduce((sum, row) => sum + toNumber(row[key]), 0);
  }

  _sumByKode(rows, kode, key, startMonth, endMonth) {
    if (!kode) return 0;
    return rows
      .filter((row) => row.kodeAnggaran.startsWith(kode) && row.tanggal.getMonth() >= startMonth && row.tanggal.getMonth() <= endMonth)
      .reduce((sum, row) => sum + toNumber(row[key]), 0);
  }
}

module.exports = { FullWorkbookExportService, TEMPLATE_NAME };
