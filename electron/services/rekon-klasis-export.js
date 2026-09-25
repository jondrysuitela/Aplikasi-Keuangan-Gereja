const ExcelJS = require("exceljs");

const CURRENCY_FORMAT = '_-"Rp"* #,##0_-;-"Rp"* #,##0_-;_-"Rp"* "-"_-;_-@_-';

function fmt(val) {
  const n = Number(val || 0);
  return Number.isFinite(n) ? n : 0;
}

function mergeRow(ws, rowIdx, colStart, colEnd, value, opts = {}) {
  if (colStart !== colEnd) ws.mergeCells(rowIdx, colStart, rowIdx, colEnd);
  const cell = ws.getCell(rowIdx, colStart);
  cell.value = value;
  cell.font = { bold: !!opts.bold, size: opts.size || 10, ...(opts.font || {}) };
  cell.alignment = { horizontal: opts.align || "left", vertical: "middle", wrapText: true };
  if (opts.fill) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
  }
  if (opts.border !== false) {
    cell.border = {
      top: { style: "thin" }, left: { style: "thin" },
      bottom: { style: "thin" }, right: { style: "thin" },
    };
  }
}

function setCell(ws, rowIdx, colIdx, value, opts = {}) {
  const cell = ws.getCell(rowIdx, colIdx);
  cell.value = value;
  cell.font = { bold: !!opts.bold, size: opts.size || 10, ...(opts.font || {}) };
  cell.alignment = { horizontal: opts.align || "left", vertical: "middle", wrapText: true };
  if (opts.fill) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
  }
  cell.border = {
    top: { style: "thin" }, left: { style: "thin" },
    bottom: { style: "thin" }, right: { style: "thin" },
  };
}

class RekonKlasisExportService {
  async export(config = {}) {
    const tahun = Number(config.tahun) || new Date().getFullYear();
    const tahunLalu = tahun - 2;
    const bulanan = config.bulanan || {};
    const pendapatanMurniTahunLalu = fmt(config.pendapatanMurniTahunLalu);
    const tanggungan = config.tanggungan || {};
    const saldoAkhir = fmt(config.saldoAkhir);
    const total = config.total || {};
    const namaJemaat = config.namaJemaat || "Jemaat";
    const klasis = config.klasis || "KLASIS";
    const penandatanganKiriNama = config.penandatanganKiriNama || "";
    const penandatanganKananNama = config.penandatanganKananNama || "";

    const wb = new ExcelJS.Workbook();
    wb.creator = "Keuangan Gereja";
    const ws = wb.addWorksheet("REKON");

    ws.columns = [
      { width: 24 }, { width: 10 }, { width: 16 }, { width: 16 },
      { width: 12 }, { width: 12 }, { width: 16 }, { width: 14 },
      { width: 12 }, { width: 16 },
    ];

    const C = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 10 };
    let r = 1;
    const DATE_NOW = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    const MONTHS = ["Januari","Pebruari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","Nopember","Desember"];

    /* ===== HEADER ===== */
    mergeRow(ws, r, C.A, C.J, `FORMAT : PENGISIAN DATA KEUANGAN TAHUN ANGGARAN ${tahun}`, { bold: true, size: 12 }); r++;
    mergeRow(ws, r, C.A, C.J, `DISAMPAIKAN PADA REVAT DAN REKON TAHUN ANGGARAN ${tahun}`, { bold: true, size: 10 }); r++;
    mergeRow(ws, r, C.A, C.J, "UNTUK JEMAAT", { bold: true, size: 10 }); r++;
    mergeRow(ws, r, C.A, C.J, `Tanggal : .....  ${DATE_NOW}`); r++;
    mergeRow(ws, r, C.A, C.H, `Klasis : ${klasis}`, { bold: false });
    setCell(ws, r, C.I, "Jemaat:", { bold: true });
    setCell(ws, r, C.J, namaJemaat, { bold: false }); r++;

    /* ===== TABLE HEADERS ===== */
    setCell(ws, r, C.A, "PENETAPAN", { bold: true, align: "center", fill: "FFF1F5F9" });
    mergeRow(ws, r, C.B, C.J, "REALISASI PERBULAN / TAHUN ", { bold: true, align: "center", fill: "FFF1F5F9" }); r++;
    setCell(ws, r, C.A, `APB-G TA ${tahun}`, { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.B, "BULAN", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.C, "M U R N I", { bold: true, align: "center", fill: "FFF1F5F9" });
    ws.mergeCells(r, C.C, r, C.D);
    setCell(ws, r, C.E, "U  K  P", { bold: true, align: "center", fill: "FFF1F5F9" });
    ws.mergeCells(r, C.E, r, C.F);
    setCell(ws, r, C.G, "DANA 69 %", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.H, "DANA 30 %", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.I, "DANA YPPK 1 %", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.J, "DANA PENDAMPING", { bold: true, align: "center", fill: "FFF1F5F9" }); r++;
    setCell(ws, r, C.A, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.B, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.C, "PENDAPATAN", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.D, "BELANJA", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.E, "PENDAPATAN", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.F, "BELANJA", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.G, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.H, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.I, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.J, "", { fill: "FFF1F5F9" }); r++;
    for (let c = 1; c <= 10; c++) {
      setCell(ws, r, c, c, { align: "center", fill: "FFF1F5F9" });
    }
    r++;

    /* ===== MONTHLY DATA ===== */
    const labelJan = ["Pendapatan", pendapatanMurniTahunLalu, "", "Belanja", pendapatanMurniTahunLalu, "", "", "Pendapatan Murni", `Tahun ${tahunLalu}`, "", "", ""];
    for (let m = 0; m < 12; m++) {
      const b = bulanan[m + 1] || {};
      const lbl = labelJan[m];
      setCell(ws, r, C.A, typeof lbl === "number" ? lbl : lbl, { align: "left" });
      setCell(ws, r, C.B, MONTHS[m], { align: "center" });
      setCell(ws, r, C.C, fmt(b.murniPendapatan), { align: "right" });
      setCell(ws, r, C.D, fmt(b.murniBelanja), { align: "right" });
      setCell(ws, r, C.E, fmt(b.ukpPendapatan), { align: "right" });
      setCell(ws, r, C.F, fmt(b.ukpBelanja), { align: "right" });
      setCell(ws, r, C.G, fmt(b.dana69 != null ? b.dana69 : Math.max(0, (b.murniBelanja || 0) - (b.dana30 || 0) - (b.danaYppk1 || 0))), { align: "right" });
      setCell(ws, r, C.H, fmt(b.dana30), { align: "right" });
      setCell(ws, r, C.I, fmt(b.danaYppk1), { align: "right" });
      setCell(ws, r, C.J, fmt(b.danaPendamping), { align: "right" });
      r++;
    }

    /* ===== JUMLAH & SALDO ===== */
    setCell(ws, r, C.A, "JUMLAH", { bold: true, fill: "FFF1F5F9" });
    setCell(ws, r, C.B, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.C, fmt(total.murniPendapatan), { bold: true, align: "right", fill: "FFF1F5F9" });
    setCell(ws, r, C.D, fmt(total.murniBelanja), { bold: true, align: "right", fill: "FFF1F5F9" });
    setCell(ws, r, C.E, fmt(total.ukpPendapatan), { bold: true, align: "right", fill: "FFF1F5F9" });
    setCell(ws, r, C.F, fmt(total.ukpBelanja), { bold: true, align: "right", fill: "FFF1F5F9" });
    setCell(ws, r, C.G, fmt(total.dana69), { bold: true, align: "right", fill: "FFF1F5F9" });
    setCell(ws, r, C.H, fmt(total.dana30), { bold: true, align: "right", fill: "FFF1F5F9" });
    setCell(ws, r, C.I, fmt(total.danaYppk1), { bold: true, align: "right", fill: "FFF1F5F9" });
    setCell(ws, r, C.J, fmt(total.danaPendamping), { bold: true, align: "right", fill: "FFF1F5F9" }); r++;
    // SALDO AKHIR (like MAPPING: C=label, D=value)
    setCell(ws, r, C.A, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.B, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.C, "SALDO AKHIR", { bold: true, align: "right", fill: "FFF1F5F9" });
    setCell(ws, r, C.D, saldoAkhir, { bold: true, align: "right", fill: "FFF1F5F9" });
    setCell(ws, r, C.E, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.F, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.G, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.H, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.I, "", { fill: "FFF1F5F9" });
    setCell(ws, r, C.J, "", { fill: "FFF1F5F9" }); r++;
    // Standalone pendapatanMurniTahunLalu value (like MAPPING)
    setCell(ws, r, C.A, pendapatanMurniTahunLalu, { align: "right" }); r++;

    /* ===== TANGGUNGAN 6 BULAN ===== */
    setCell(ws, r, C.A, "Tanggungan 6 Bln", { bold: true, fill: "FFF1F5F9" });
    setCell(ws, r, C.B, "Penetapan", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.C, "Realisasi", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.D, "Selisih", { bold: true, align: "center", fill: "FFF1F5F9" });
    mergeRow(ws, r, C.E, C.J, "Majelis Jemaat " + namaJemaat, { bold: true, align: "center", fill: "FFF1F5F9" }); r++;

    const t6 = tanggungan.bulan6 || {};
    // Institusi 30%
    setCell(ws, r, C.A, "Institusi 30%", { bold: true });
    setCell(ws, r, C.B, fmt(t6.institusi30?.penetapan), { align: "right" });
    setCell(ws, r, C.C, fmt(t6.institusi30?.realisasi), { align: "right" });
    setCell(ws, r, C.D, fmt(t6.institusi30?.selisih), { align: "right" }); r++;
    // YPPK 1%
    setCell(ws, r, C.A, "YPPK 1%", { bold: true });
    setCell(ws, r, C.B, fmt(t6.yppk1?.penetapan), { align: "right" });
    setCell(ws, r, C.C, fmt(t6.yppk1?.realisasi), { align: "right" });
    setCell(ws, r, C.D, fmt(t6.yppk1?.selisih), { align: "right" });
    mergeRow(ws, r, C.E, C.G, "K  e  t  u  a", { bold: true, align: "center" });
    setCell(ws, r, C.H, "K e t u a", { bold: true, align: "center" });
    setCell(ws, r, C.I, "Bendahara", { bold: true, align: "center" });
    setCell(ws, r, C.J, ""); r++;
    // Pendamping 7%
    setCell(ws, r, C.A, "Pendamping 7%", { bold: true });
    setCell(ws, r, C.B, fmt(t6.pendamping7?.penetapan), { align: "right" });
    setCell(ws, r, C.C, fmt(t6.pendamping7?.realisasi), { align: "right" });
    setCell(ws, r, C.D, fmt(t6.pendamping7?.selisih), { align: "right" }); r++;
    // Blank row
    r++;
    /* ===== TANGGUNGAN 1 TAHUN ===== */
    setCell(ws, r, C.A, "Tanggungan 1 Thn", { bold: true, fill: "FFF1F5F9" });
    setCell(ws, r, C.B, "Penetapan", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.C, "Realisasi", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.D, "Selisih", { bold: true, align: "center", fill: "FFF1F5F9" });
    setCell(ws, r, C.E, "", { fill: "FFF1F5F9" }); r++;

    const t1 = tanggungan.tahun1 || {};
    setCell(ws, r, C.A, "Institusi 30%", { bold: true });
    setCell(ws, r, C.B, fmt(t1.institusi30?.penetapan), { align: "right" });
    setCell(ws, r, C.C, fmt(t1.institusi30?.realisasi), { align: "right" });
    setCell(ws, r, C.D, fmt(t1.institusi30?.selisih), { align: "right" });
    setCell(ws, r, C.E, penandatanganKiriNama, { bold: true, align: "center" });
    setCell(ws, r, C.H, penandatanganKananNama, { bold: true, align: "center" }); r++;
    setCell(ws, r, C.A, "YPPK 1%", { bold: true });
    setCell(ws, r, C.B, fmt(t1.yppk1?.penetapan), { align: "right" });
    setCell(ws, r, C.C, fmt(t1.yppk1?.realisasi), { align: "right" });
    setCell(ws, r, C.D, fmt(t1.yppk1?.selisih), { align: "right" }); r++;
    setCell(ws, r, C.A, "Pendamping 7%", { bold: true });
    setCell(ws, r, C.B, fmt(t1.pendamping7?.penetapan), { align: "right" });
    setCell(ws, r, C.C, fmt(t1.pendamping7?.realisasi), { align: "right" });
    setCell(ws, r, C.D, fmt(t1.pendamping7?.selisih), { align: "right" }); r++;

    // Apply number format
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === "number" && cell.value !== 0) {
          cell.numFmt = CURRENCY_FORMAT;
        }
      });
    });

    return wb;
  }




}

module.exports = { RekonKlasisExportService };
