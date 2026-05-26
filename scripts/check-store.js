const fs = require('fs');
const path = require('path');

const ldbDir = path.join(process.env.APPDATA, 'keuangan-gereja', 'Local Storage', 'leveldb');

// Try reading with different approaches
const files = fs.readdirSync(ldbDir).filter(f => f.endsWith('.log'));
console.log('Looking in .log files:', files);

for (const f of files) {
  const buf = fs.readFileSync(path.join(ldbDir, f));
  // Try to find any recognizable JSON patterns
  const text = buf.toString('utf-8', 0, buf.length);
  const idx = text.indexOf('keuangan');
  if (idx >= 0) {
    console.log('Found "keuangan" at position', idx, 'in file', f);
    // Print surrounding context
    const start = Math.max(0, idx - 50);
    const end = Math.min(text.length, idx + 500);
    const snippet = text.substring(start, end);
    console.log('Snippet (first 500 chars from "keuangan"):');
    console.log(snippet.replace(/[\x00-\x1f\x7f-\x9f]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')));
  }
}

// Also try .ldb with raw scan
const ldbFiles = fs.readdirSync(ldbDir).filter(f => f.endsWith('.ldb'));
console.log('\nLooking in .ldb files:', ldbFiles);

for (const f of ldbFiles) {
  const buf = fs.readFileSync(path.join(ldbDir, f));
  const text = buf.toString('utf-8', 0, buf.length);

  // Look for "jumlah" which should appear in pemasukans/pengeluarans
  const patterns = ['"jumlah"', '"pemasukans"', '"pengeluarans"', '"doorscrieftTransaksis"'];
  for (const pat of patterns) {
    const idx = text.indexOf(pat);
    if (idx >= 0) {
      console.log('Found', pat, 'at', idx, 'in', f);
      // Try to extract from this position
      let depth = 0;
      let arrStart = -1;
      // Find the opening bracket
      for (let i = idx; i < Math.min(idx + 1000, text.length); i++) {
        if (text[i] === '[') { arrStart = i; break; }
      }
      if (arrStart >= 0) {
        let d = 0;
        let inStr = false;
        let esc = false;
        for (let i = arrStart; i < text.length; i++) {
          const ch = text[i];
          if (esc) { esc = false; continue; }
          if (ch === '\\') { esc = true; continue; }
          if (ch === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (ch === '[' || ch === '{') d++;
          if (ch === ']' || ch === '}') d--;
          if (d === 0) {
            const chunk = text.substring(arrStart, i + 1);
            console.log('Array chunk length:', chunk.length);
            // Try to count items
            const itemMatches = chunk.match(/"jumlah":/g);
            console.log('Found "jumlah" occurrences:', itemMatches ? itemMatches.length : 0);
            break;
          }
        }
      }
    }
  }
}
