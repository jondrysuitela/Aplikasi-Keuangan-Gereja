const XLSX = require("xlsx");
const path = require("path");

const FILE = path.join(__dirname, "data", "APLIKASI KEUANGAN TAHUN 2025 FINAL.xlsx");
const wb = XLSX.readFile(FILE);

console.log("=== Sheet names ===");
console.log(wb.SheetNames);
console.log("");

// 1. DOORSCRIEFT2 - first 5 rows
console.log("=== DOORSCRIEFT2 (first 5 rows: NO, URAIAN, MATA ANGGARAN, PENERIMAAN, PENGELUARAN) ===");
const ds = wb.Sheets["DOORSCRIEFT2"];
if (ds) {
  const rows = XLSX.utils.sheet_to_json(ds, { header: 1, defval: "" });
  const headers = rows[0];
  console.log("Headers:", headers);
  for (let i = 1; i <= 5 && i < rows.length; i++) {
    const r = rows[i];
    const no = r[headers.indexOf("NO")] ?? r[0];
    const uraian = r[headers.indexOf("URAIAN")] ?? r[1];
    const ma = r[headers.indexOf("MATA ANGGARAN")] ?? r[2];
    const penerimaan = r[headers.indexOf("PENERIMAAN")] ?? r[3];
    const pengeluaran = r[headers.indexOf("PENGELUARAN")] ?? r[4];
    console.log(`Row ${i}: NO=${no} | URAIAN=${uraian} | MATA ANGGARAN=${ma} | PENERIMAAN=${penerimaan} | PENGELUARAN=${pengeluaran}`);
  }
} else {
  console.log("Sheet not found");
}
console.log("");

// 2. DATA BASE2 - first 10 rows
console.log("=== DATA BASE2 (first 10 rows: KODE ANGGARAN, MATA ANGGARAN) ===");
const db = wb.Sheets["DATA BASE2"];
if (db) {
  const rows = XLSX.utils.sheet_to_json(db, { header: 1, defval: "" });
  const headers = rows[0];
  console.log("Headers:", headers);
  const ki = headers.indexOf("KODE ANGGARAN");
  const mi = headers.indexOf("MATA ANGGARAN");
  for (let i = 1; i <= 10 && i < rows.length; i++) {
    const r = rows[i];
    console.log(`Row ${i}: KODE ANGGARAN=${r[ki] ?? r[0]} | MATA ANGGARAN=${r[mi] ?? r[1]}`);
  }
} else {
  console.log("Sheet not found");
}
console.log("");

// 3. SUB SEKSI PENDAPATAN - first 10 rows, col 0 and 1
console.log("=== SUB SEKSI PENDAPATAN (first 10 rows: col 0, col 1) ===");
const ssp = wb.Sheets["SUB SEKSI PENDAPATAN"];
if (ssp) {
  const rows = XLSX.utils.sheet_to_json(ssp, { header: 1, defval: "" });
  for (let i = 0; i <= 10 && i < rows.length; i++) {
    const r = rows[i];
    console.log(`Row ${i}: col0="${r[0]}" | col1="${r[1]}"`);
  }
} else {
  console.log("Sheet not found");
}
console.log("");

// 4. SUB SEKSI PENGELUARAN - first 10 rows, col 0 and 1
console.log("=== SUB SEKSI PENGELUARAN (first 10 rows: col 0, col 1) ===");
const sspg = wb.Sheets["SUB SEKSI PENGELUARAN"];
if (sspg) {
  const rows = XLSX.utils.sheet_to_json(sspg, { header: 1, defval: "" });
  for (let i = 0; i <= 10 && i < rows.length; i++) {
    const r = rows[i];
    console.log(`Row ${i}: col0="${r[0]}" | col1="${r[1]}"`);
  }
} else {
  console.log("Sheet not found");
}
