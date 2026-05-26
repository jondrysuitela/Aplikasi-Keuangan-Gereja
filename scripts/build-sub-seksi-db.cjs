/**
 * Build complete Sub Seksi database from Excel sources.
 * Sources (priority order):
 *   1. SUB SEKSI.xlsx - authoritative names for Sub Seksi entries & children
 *   2. batang-tubuh.json - hierarchy, dianggarkan/realisasi values
 *   3. DATA BASE2 sheet - supplementary leaf codes
 *
 * Output:
 *   sub-seksi-db.json      - hierarchical (12 top-level, Batang Tubuh, detail rows with children)
 *   sub-seksi-db-flat.json  - flat lookup table
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const batangTubuhPath = path.join(dataDir, 'batang-tubuh.json');

// ── 1. Read SUB SEKSI.xlsx (authoritative for Sub Seksi names & children) ──
const subSeksiWb = XLSX.readFile(path.join(dataDir, 'SUB SEKSI.xlsx'));
const subSeksiRows = [];
for (const sn of subSeksiWb.SheetNames) {
  const ws = subSeksiWb.Sheets[sn];
  const data = XLSX.utils.sheet_to_json(ws, { header: 'A', defval: '' });
  data.forEach(r => {
    if (r.A && r.B) subSeksiRows.push({ kode: String(r.A).trim(), nama: String(r.B).trim() });
  });
}
console.log(`SUB SEKSI.xlsx: ${subSeksiRows.length} rows`);

// ── 2. Read batang-tubuh.json (full hierarchy + dianggarkan/realisasi) ──
const existingBT = JSON.parse(fs.readFileSync(batangTubuhPath, 'utf-8'));

// ── 3. Read DATA BASE2 from main Excel (supplementary leaf codes) ──
let db2Rows = [];
const mainExcelPath = path.join(dataDir, 'APLIKASI KEUANGAN TAHUN 2025 FINAL.xlsx');
if (fs.existsSync(mainExcelPath)) {
  const wb = XLSX.readFile(mainExcelPath);
  if (wb.Sheets['DATA BASE2']) {
    db2Rows = XLSX.utils.sheet_to_json(wb.Sheets['DATA BASE2'], { defval: '' });
  }
}
console.log(`DATA BASE2: ${db2Rows.length} rows`);

// ── Build unified code registry ──
const allCodes = new Map();

function addCode(kode, nama, source = '') {
  if (!kode) return;
  kode = kode.trim();
  nama = (nama || '').trim();
  if (allCodes.has(kode)) {
    // SUB SEKSI.xlsx overrides names (authoritative)
    if (source === 'sub-seksi-excel' && nama) {
      allCodes.get(kode).nama = nama;
    }
  } else {
    allCodes.set(kode, { kode, nama });
  }
}

// Priority 1: SUB SEKSI.xlsx (authoritative names)
subSeksiRows.forEach(r => addCode(r.kode, r.nama, 'sub-seksi-excel'));

// Priority 2: batang-tubuh.json (hierarchy + values)
existingBT.forEach(sub => {
  addCode(sub.kode, sub.nama, 'batang-tubuh');
  sub.batangTubuh?.forEach(bt => {
    addCode(bt.kode, bt.nama, 'batang-tubuh');
    bt.detailRows?.forEach(d => {
      addCode(d.kode, d.nama, 'batang-tubuh');
    });
  });
});

// Priority 3: DATA BASE2 (supplementary leaves)
db2Rows.forEach(r => {
  const kode = String(r['KODE ANGGARAN'] ?? '').trim();
  const nama = String(r['MATA ANGGARAN'] ?? '').trim();
  if (kode) addCode(kode, nama, 'database2');
});

// Fallback: add names for top-level codes missing from all sources
const topLevelNames = {
  'I.1': 'BAGIAN SISA LEBIH ANGG TAHUN LALU',
  'I.2': 'BAGIAN PENDAPATAN TETAP GEREJA',
  'I.3': 'BAGIAN PENDAPATAN PELAYANAN GEREJA',
  'I.4': 'BAGIAN PENDAPATAN UNIT USAHA GEREJA',
  'I.5': 'BAGIAN PENDAPATAN LAIN-LAIN',
  'I.6': 'BAGIAN PENDAPATAN UKP',
  'II.1': 'BAGIAN SISA KURANG ANGG THN LALU',
  'II.2': 'BAGIAN BELANJA TETAP GEREJA',
  'II.3': 'BAGIAN BELANJA PELAYANAN GEREJA',
  'II.4': 'BAGIAN BELANJA UNIT USAHA',
  'II.5': 'BAGIAN BELANJA LAIN-LAIN',
  'II.6': 'BAGIAN BELANJA UKP',
};
Object.entries(topLevelNames).forEach(([kode, nama]) => addCode(kode, nama, 'fallback'));

// Build dianggarkan/realisasi lookup from batang-tubuh.json
const btLookup = {};
existingBT.forEach(sub => {
  sub.batangTubuh?.forEach(bt => {
    bt.detailRows?.forEach(d => {
      btLookup[d.kode] = { dianggarkan: d.dianggarkan || 0, realisasi: d.realisasi || 0 };
    });
  });
});

// ── Derive parent-child relationships ──
function getParentCode(kode) {
  const parts = kode.split('.');
  if (parts.length <= 2) return null;
  return parts.slice(0, -1).join('.');
}

const childrenMap = new Map();
allCodes.forEach((info, kode) => {
  const parent = getParentCode(kode);
  if (parent) {
    if (!childrenMap.has(parent)) childrenMap.set(parent, []);
    childrenMap.get(parent).push(kode);
  }
});

// Sort children by code for consistent ordering
childrenMap.forEach((kids) => kids.sort());

console.log(`Total registered codes: ${allCodes.size}`);
console.log(`Parent codes with children: ${childrenMap.size}`);

// ── Build hierarchical database ──
const topLevelCodes = ['I.1', 'I.2', 'I.3', 'I.4', 'I.5', 'I.6', 'II.1', 'II.2', 'II.3', 'II.4', 'II.5', 'II.6'];

function countDescendants(code) {
  let count = 0;
  const kids = childrenMap.get(code) || [];
  count += kids.length;
  kids.forEach(k => { count += countDescendants(k); });
  return count;
}

function buildChildren(parentCode) {
  const directChildren = childrenMap.get(parentCode) || [];
  return directChildren.map(childCode => {
    const childInfo = allCodes.get(childCode) || { nama: '' };
    const hasGrandChildren = childrenMap.has(childCode);
    const lookup = btLookup[childCode] || { dianggarkan: 0, realisasi: 0 };

    if (hasGrandChildren) {
      const kids = buildChildren(childCode);
      return {
        kode: childCode,
        nama: childInfo.nama,
        dianggarkan: lookup.dianggarkan,
        realisasi: lookup.realisasi,
        parentKode: parentCode,
        children: kids,
      };
    }
    return {
      kode: childCode,
      nama: childInfo.nama,
      dianggarkan: lookup.dianggarkan,
      realisasi: lookup.realisasi,
      parentKode: parentCode,
      children: [],
    };
  });
}

const subSeksiDb = topLevelCodes.map(ssCode => {
  const ssInfo = allCodes.get(ssCode) || { nama: ssCode };
  const jenis = ssCode.startsWith('II.') ? 'pengeluaran' : 'pendapatan';
  const btChildren = childrenMap.get(ssCode) || [];

  const batangTubuh = btChildren.map(btCode => {
    const btInfo = allCodes.get(btCode) || { nama: '' };
    const detailRows = buildChildren(btCode);
    return {
      kode: btCode,
      nama: btInfo.nama,
      parentKode: ssCode,
      parentNama: ssInfo.nama,
      detailRows: detailRows.length > 0 ? detailRows : undefined,
    };
  });

  return {
    kode: ssCode,
    nama: ssInfo.nama,
    jenis,
    batangTubuh: batangTubuh.length > 0 ? batangTubuh : undefined,
    totalChildren: countDescendants(ssCode),
  };
});

// ── Build flat version ──
const subSeksiFlat = [];

function flatten(rows, ss, bt, parentKode) {
  for (const r of rows) {
    subSeksiFlat.push({
      subSeksiKode: ss.kode,
      subSeksiNama: ss.nama,
      batangTubuhKode: bt.kode,
      batangTubuhNama: bt.nama,
      kode: r.kode,
      nama: r.nama,
      dianggarkan: r.dianggarkan,
      realisasi: r.realisasi,
      parentKode: r.parentKode || parentKode,
      jenis: ss.jenis,
    });
    if (r.children && r.children.length > 0) {
      flatten(r.children, ss, bt, r.kode);
    }
  }
}

subSeksiDb.forEach(ss => {
  ss.batangTubuh?.forEach(bt => {
    bt.detailRows?.forEach(dr => {
      subSeksiFlat.push({
        subSeksiKode: ss.kode,
        subSeksiNama: ss.nama,
        batangTubuhKode: bt.kode,
        batangTubuhNama: bt.nama,
        kode: dr.kode,
        nama: dr.nama,
        dianggarkan: dr.dianggarkan,
        realisasi: dr.realisasi,
        parentKode: dr.parentKode,
        jenis: ss.jenis,
      });
      if (dr.children && dr.children.length > 0) {
        flatten(dr.children, ss, bt, dr.kode);
      }
    });
  });
});

// ── Write output ──
fs.writeFileSync(
  path.join(dataDir, 'sub-seksi-db.json'),
  JSON.stringify(subSeksiDb, null, 2),
  'utf-8'
);

fs.writeFileSync(
  path.join(dataDir, 'sub-seksi-db-flat.json'),
  JSON.stringify(subSeksiFlat, null, 2),
  'utf-8'
);

// Summary
console.log('\n=== Sub Seksi Database Summary ===');
let totalCodes = 0;
let totalChildren = 0;
subSeksiDb.forEach(ss => {
  let btCount = 0, detailCount = 0;
  ss.batangTubuh?.forEach(bt => {
    btCount++;
    function countDetailRows(rows) {
      rows.forEach(d => {
        detailCount++;
        totalCodes++;
        if (d.children?.length) countDetailRows(d.children);
        if (d.children?.length) totalChildren += d.children.length;
      });
    }
    bt.detailRows?.forEach(d => {
      detailCount++;
      totalCodes++;
      if (d.children?.length) countDetailRows(d.children);
      if (d.children?.length) totalChildren += d.children.length;
    });
  });
  console.log(`${ss.kode} - ${ss.nama} (${ss.jenis})`);
  console.log(`  Batang Tubuh: ${btCount}, Codes: ${totalCodes}, Parent-Child: ${ss.totalChildren}`);
});
console.log(`\nTotal flat entries: ${subSeksiFlat.length}`);
console.log(`Written: sub-seksi-db.json, sub-seksi-db-flat.json`);
