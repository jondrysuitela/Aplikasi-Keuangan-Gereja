const fs = require('fs');
const path = require('path');

let XLSX;
function loadXLSX() {
  if (!XLSX) XLSX = require('xlsx');
  return XLSX;
}

function normalizeHeader(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseCsvStringToRows(text) {
  // naive CSV parse using XLSX (handles quotes)
  const XLSX = loadXLSX();
  const wb = XLSX.read(text, { type: 'string' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function readFileRows(filePath) {
  const ext = (path.extname(filePath) || '').toLowerCase();
  const XLSX = loadXLSX();
  if (ext === '.csv' || ext === '.txt') {
    const text = fs.readFileSync(filePath, 'utf8');
    return parseCsvStringToRows(text);
  }
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function detectColumns(row) {
  const keys = Object.keys(row);
  const map = { kode: null, dianggarkan: null, nama: null, program: null, keterangan: null };
  for (const k of keys) {
    const nk = normalizeHeader(k);
    if (!map.kode && /^(kode|kode_anggaran|kodeanggaran|kode_ang|kodeang)/.test(nk)) map.kode = k;
    if (!map.dianggarkan && /^(dianggarkan|anggaran|budget|amount|nilai|nominal|jumlah)$/i.test(nk)) map.dianggarkan = k;
    if (!map.nama && /^(nama|mata_anggaran|mataangg|mata_anggaran_program|description|uraian)$/i.test(nk)) map.nama = k;
    if (!map.program && /^(program|nama_program|kegiatan|nama_kegiatan)$/i.test(nk)) map.program = k;
    if (!map.keterangan && /^(keterangan|rincian|rincian_program|uraian_rincian|uraian)$/i.test(nk)) map.keterangan = k;
  }
  // fallback: prefer typical 3-column layout: kode, nama, dianggarkan
  if (!map.kode && keys.length > 0) map.kode = keys[0];
  if (!map.nama && keys.length > 1) map.nama = keys[1];
  if (!map.dianggarkan) {
    if (keys.length > 2) map.dianggarkan = keys[2];
    else if (keys.length > 1) map.dianggarkan = keys[1];
  }
  return map;
}

function parseNumberString(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  let s = String(val).trim();
  if (!s) return 0;
  // keep digits, minus, dot and comma
  s = s.replace(/[^0-9\-,\.]/g, '');
  const hasDot = s.indexOf('.') !== -1;
  const hasComma = s.indexOf(',') !== -1;
  if (hasDot && hasComma) {
    // assume dot is thousand separator and comma is decimal (e.g. 1.234,56)
    s = s.replace(/\./g, '').replace(/,/g, '.');
  } else if (hasComma && !hasDot) {
    // assume comma is decimal separator
    s = s.replace(/,/g, '.');
  } else if (hasDot && !hasComma) {
    // if multiple dots, likely thousand separators
    if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

exports.preview = async function (filePath, limit = 10) {
  try {
    const rows = readFileRows(filePath || '');
    if (!rows || rows.length === 0) return { rows: [], columns: [] };
    const columns = Object.keys(rows[0] || {});
    const detected = detectColumns(rows[0]);
    const sample = rows.slice(0, limit).map((r) => {
      const kode = String(r[detected.kode] || '').trim();
      const nama = String(detected.nama ? r[detected.nama] : r[detected.kode] || '').trim();
      const dianggarkan = parseNumberString(r[detected.dianggarkan]);
      const program = String(detected.program ? r[detected.program] : '').trim();
      const keterangan = String(detected.keterangan ? r[detected.keterangan] : '').trim();
      return { raw: r, kode, nama, program, keterangan, jumlah: dianggarkan, dianggarkan };
    });
    return { rows: sample, columns, detected, total: rows.length };
  } catch (e) {
    console.error('batang-tubuh-import preview failed', e);
    return { rows: [], columns: [], error: e.message };
  }
};

exports.import = async function (filePath) {
  try {
    const rows = readFileRows(filePath || '');
    if (!rows || rows.length === 0) return { items: [], total: 0 };
    const detected = detectColumns(rows[0]);
    const items = rows.map((r) => {
      const kode = String(r[detected.kode] || '').trim();
      const nama = String(detected.nama ? r[detected.nama] : r[detected.kode] || '').trim();
      const dianggarkan = parseNumberString(r[detected.dianggarkan]);
      const program = String(detected.program ? r[detected.program] : '').trim();
      const keterangan = String(detected.keterangan ? r[detected.keterangan] : '').trim();
      return { kode, nama, program, keterangan, jumlah: dianggarkan, dianggarkan };
    }).filter((it) => it.kode);
    return { items, total: items.length };
  } catch (e) {
    console.error('batang-tubuh-import failed', e);
    return { items: [], total: 0, error: e.message };
  }
};
