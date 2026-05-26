const XLSX = require('xlsx');
const path = require('path');

const filePath = 'c:\\Users\\user\\keuangan-app\\data\\APLIKASI KEUANGAN TAHUN 2025 FINAL.xlsx';
const workbook = XLSX.readFile(filePath);

console.log('=== STRUKTUR SHEET ===');
console.log('Sheet names:', workbook.SheetNames);
console.log('');

// Analyze each sheet
workbook.SheetNames.forEach(sheetName => {
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log(`\n=== SHEET: ${sheetName} ===`);
  console.log(`Rows: ${data.length}`);
  if (data.length > 0) {
    console.log('Headers (row 1):', data[0].slice(0, 15));
    if (data.length > 1) {
      console.log('Sample row 2:', data[1].slice(0, 10));
    }
  }
});
