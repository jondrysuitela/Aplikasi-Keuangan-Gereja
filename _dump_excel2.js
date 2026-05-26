const XLSX = require('xlsx-js-style');
const wb = XLSX.readFile('data\\Doorscrieft.xlsx', { cellFormula: true });
const ws = wb.Sheets['DOORSCRIEFT2'];

// Find last row
const range = ws['!ref'] || 'A1:F1';
const match = range.match(/F(\d+)/);
const lastRow = match ? parseInt(match[1]) : 1;
console.log('Last row:', lastRow);

for (let r = 51; r <= lastRow; r++) {
  const cells = ['A','B','C','D','E','F'];
  const vals = cells.map(c => {
    const ref = c + r;
    const cell = ws[ref];
    if (!cell) return null;
    return { ref, v: cell.v, f: cell.f || null };
  }).filter(Boolean);
  if (vals.length > 0) {
    console.log(`Row ${r}:`, JSON.stringify(vals));
  }
}
