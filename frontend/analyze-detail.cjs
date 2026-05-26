const XLSX = require('xlsx');
const path = require('path');

const filePath = 'c:\\Users\\user\\keuangan-app\\data\\APLIKASI KEUANGAN TAHUN 2025 FINAL.xlsx';
const workbook = XLSX.readFile(filePath);

// Analyze DOORSCRIEFT2 in detail
console.log('\n=== ANALISIS DOORSCRIEFT2 (SHEET INPUT UTAMA) ===');
const doorsheet = workbook.Sheets['DOORSCRIEFT2'];
const doorData = XLSX.utils.sheet_to_json(doorsheet);
console.log('Total rows:', doorData.length);

// Get unique mata anggaran
const mataAnggaranSet = new Set();
doorData.forEach(row => {
  if (row['MATA ANGGARAN']) {
    mataAnggaranSet.add(row['MATA ANGGARAN']);
  }
});
console.log('\nMata Anggaran yang digunakan:', Array.from(mataAnggaranSet).slice(0, 50));

// Sample data
console.log('\n=== SAMPLE DATA (5 rows pertama dengan mata anggaran) ===');
const withMA = doorData.filter(r => r['MATA ANGGARAN']).slice(0, 5);
withMA.forEach((row, i) => {
  console.log(`Row ${i+1}:`, JSON.stringify(row, null, 2).substring(0, 500));
});

// Analyze KOMP. PENDAPATAN
console.log('\n\n=== ANALISIS KOMP. PENDAPATAN ===');
const kompPendapatan = workbook.Sheets['KOMP. PENDAPATAN'];
const kpData = XLSX.utils.sheet_to_json(kompPendapatan);
console.log('Total rows:', kpData.length);

// Find columns with mata anggaran
if (kpData.length > 0) {
  console.log('Columns:', Object.keys(kpData[0]));
  // Look for uraian and mata anggaran
  const uniqueMA = new Set();
  kpData.forEach(row => {
    Object.values(row).forEach(v => {
      if (typeof v === 'string' && v.match(/^\d+\.\d+/)) {
        uniqueMA.add(v);
      }
    });
  });
  console.log('Unique Mata Anggaran patterns found:', Array.from(uniqueMA).slice(0, 30));
}

// Analyze KOMP. BELANJA
console.log('\n\n=== ANALISIS KOMP. BELANJA ===');
const kompBelanja = workbook.Sheets['KOMP. BELANJA'];
const kbData = XLSX.utils.sheet_to_json(kompBelanja);
console.log('Total rows:', kbData.length);

if (kbData.length > 0) {
  console.log('Columns:', Object.keys(kbData[0]));
  const uniqueMA = new Set();
  kbData.forEach(row => {
    Object.values(row).forEach(v => {
      if (typeof v === 'string' && v.match(/^\d+\.\d+/)) {
        uniqueMA.add(v);
      }
    });
  });
  console.log('Unique Mata Anggaran patterns found:', Array.from(uniqueMA).slice(0, 30));
}
