const XLSX = require('xlsx-js-style');
const wb = XLSX.readFile('data\\Doorscrieft.xlsx', { cellFormula: true });
const ws = wb.Sheets['DOORSCRIEFT2'];

for (let r = 1; r <= 50; r++) {
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
