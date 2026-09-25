import { useMemo, useState, useCallback, useEffect } from "react";
import { useStore } from "@/stores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatCurrency } from "@/lib/utils";
import { getElectronAPI } from "@/lib/electron";
import {
  FileSpreadsheet,
  Upload,
  Database,
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  Wallet,
  Calculator,
  History,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const MONTHS = [
  "Januari", "Pebruari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "Nopember", "Desember",
];

type RekonBulan = {
  murniPendapatan: number;
  murniBelanja: number;
  ukpPendapatan: number;
  ukpBelanja: number;
  dana30: number;
  danaYppk1: number;
  danaPendamping: number;
};

type RekonImportData = {
  penetapanPendapatan: number;
  penetapanBelanja: number;
  pendapatanMurniTahunLalu: number;
  bulanan: Record<number, RekonBulan>;
};

const STORAGE_KEY_PREFIX = "keuangan-gereja-rekon-import-";
const PENETAPAN_KEY_PREFIX = "keuangan-gereja-rekon-penetapan-";
const ANNUAL_STORAGE_KEY = "keuangan-gereja-tahunan";

function loadAnnualYears() {
  try {
    const raw = localStorage.getItem(ANNUAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function loadPenetapan(tahun: number) {
  try {
    const raw = localStorage.getItem(PENETAPAN_KEY_PREFIX + tahun);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { pendapatan: 0, belanja: 0, pendapatanMurniTahunLalu: 0 };
}

function savePenetapan(tahun: number, data: { pendapatan: number; belanja: number; pendapatanMurniTahunLalu: number }) {
  localStorage.setItem(PENETAPAN_KEY_PREFIX + tahun, JSON.stringify(data));
}




function loadImportData(tahun: number): RekonImportData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + tahun);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveImportData(tahun: number, data: RekonImportData) {
  localStorage.setItem(STORAGE_KEY_PREFIX + tahun, JSON.stringify(data));
}

export function RekonKlasisPage() {
  const { tahunAktif: tahunAktifStore, doorscrieftTransaksis, namaJemaat, batangTubuhAnggaranByYear } = useStore();
  const tahunAktif = tahunAktifStore ?? new Date().getFullYear();

  const [dataSource, setDataSource] = useState<"app" | "import">("app");
  const [semester, setSemester] = useState<1 | 2>(1);
  const [showAnnualData, setShowAnnualData] = useState(false);
  const [annualYears, setAnnualYears] = useState<Record<string, { pemasukanMurni: number; pengeluaranMurni: number; saldo: number; dianggarkanPendapatan: number; dianggarkanPengeluaran: number }>>({});
  const [editYear, setEditYear] = useState("");
  const [editPemasukan, setEditPemasukan] = useState(0);
  const [editPengeluaran, setEditPengeluaran] = useState(0);
  const [editSaldo, setEditSaldo] = useState(0);
  const [editDianggarkanPendapatan, setEditDianggarkanPendapatan] = useState(0);
  const [editDianggarkanPengeluaran, setEditDianggarkanPengeluaran] = useState(0);
  const [penetapanPendapatan, setPenetapanPendapatan] = useState(0);
  const [penetapanBelanja, setPenetapanBelanja] = useState(0);
  const [penetapanMurniTahunLalu, setPenetapanMurniTahunLalu] = useState(0);
  const [importData, setImportData] = useState<RekonImportData | null>(null);

  useEffect(() => {
    const years = loadAnnualYears();
    setAnnualYears(years);

    const prev2Year = years[String(tahunAktif - 2)];

    const anggaranTahunIni = batangTubuhAnggaranByYear[String(tahunAktif)] || {};
    const autoPendapatan = Object.entries(anggaranTahunIni)
      .filter(([k]) => k.startsWith("I.") || k === "I")
      .reduce((s, [, v]) => s + (Number(v) || 0), 0);
    const autoBelanja = Object.entries(anggaranTahunIni)
      .filter(([k]) => k.startsWith("II"))
      .reduce((s, [, v]) => s + (Number(v) || 0), 0);
    // Auto calculate Pendapatan Murni Tahun Lalu dari saved data atau doorscrieft jika belum tersimpan
    let autoMurniLalu = prev2Year?.pemasukanMurni || 0;
    if (!autoMurniLalu) {
      const prevYear = tahunAktif - 2;
      let rtPemasukan = 0;
      for (const t of doorscrieftTransaksis) {
        const d = new Date(t.tanggal);
        if (!Number.isNaN(d.getTime()) && d.getFullYear() === prevYear) {
          const tk = t.kodeAnggaran || "";
          if (tk.startsWith("I.1") || tk.startsWith("I.2") || tk.startsWith("I.3") || tk.startsWith("I.4") || tk.startsWith("I.5")) {
            rtPemasukan += Number(t.penerimaan || 0);
          }
        }
      }
      autoMurniLalu = rtPemasukan || 0;
    }

    const saved = loadPenetapan(tahunAktif);

    setPenetapanPendapatan(autoPendapatan || saved.pendapatan);
    setPenetapanBelanja(autoBelanja || saved.belanja);
    setPenetapanMurniTahunLalu(autoMurniLalu || saved.pendapatanMurniTahunLalu);

    savePenetapan(tahunAktif, {
      pendapatan: autoPendapatan || saved.pendapatan,
      belanja: autoBelanja || saved.belanja,
      pendapatanMurniTahunLalu: autoMurniLalu || saved.pendapatanMurniTahunLalu,
    });
    const imported = loadImportData(tahunAktif);
    if (imported) {
      setImportData(imported);
      setDataSource("import");
    } else {
      setDataSource("app");
    }
  }, [tahunAktif]);

  const updatePenetapanPendapatan = useCallback((val: number) => {
    setPenetapanPendapatan(val);
    savePenetapan(tahunAktif, { pendapatan: val, belanja: penetapanBelanja, pendapatanMurniTahunLalu: penetapanMurniTahunLalu });
  }, [tahunAktif, penetapanBelanja, penetapanMurniTahunLalu]);

  const updatePenetapanBelanja = useCallback((val: number) => {
    setPenetapanBelanja(val);
    savePenetapan(tahunAktif, { pendapatan: penetapanPendapatan, belanja: val, pendapatanMurniTahunLalu: penetapanMurniTahunLalu });
  }, [tahunAktif, penetapanPendapatan, penetapanMurniTahunLalu]);

  const updatePenetapanMurniTahunLalu = useCallback((val: number) => {
    setPenetapanMurniTahunLalu(val);
    savePenetapan(tahunAktif, { pendapatan: penetapanPendapatan, belanja: penetapanBelanja, pendapatanMurniTahunLalu: val });
  }, [tahunAktif, penetapanPendapatan, penetapanBelanja]);

  const appData = useMemo(() => {
    const byMonth: Record<number, RekonBulan> = {};
    for (let m = 1; m <= 12; m++) {
      byMonth[m] = { murniPendapatan: 0, murniBelanja: 0, ukpPendapatan: 0, ukpBelanja: 0, dana30: 0, danaYppk1: 0, danaPendamping: 0 };
    }
    for (const t of doorscrieftTransaksis) {
      const d = new Date(t.tanggal);
      if (Number.isNaN(d.getTime()) || d.getFullYear() !== tahunAktif) continue;
      const m = d.getMonth() + 1;
      const penerimaan = Number(t.penerimaan || 0);
      const pengeluaran = Number(t.pengeluaran || 0);
      const kode = t.kodeAnggaran || "";
      if (kode.startsWith("I.1") || kode.startsWith("I.2") || kode.startsWith("I.3") || kode.startsWith("I.4") || kode.startsWith("I.5")) {
        byMonth[m].murniPendapatan += penerimaan;
      }
      if (kode.startsWith("II.1") || kode.startsWith("II.2") || kode.startsWith("II.3") || kode.startsWith("II.4") || kode.startsWith("II.5")) {
        byMonth[m].murniBelanja += pengeluaran;
      }
      if (kode.startsWith("I.6.1")) byMonth[m].ukpPendapatan += penerimaan;
      if (kode.startsWith("II.6.1")) byMonth[m].ukpBelanja += pengeluaran;
      if (kode === "II.2.1.01") byMonth[m].dana30 += pengeluaran;
      if (kode === "II.2.1.02") byMonth[m].danaYppk1 += pengeluaran;
      if (kode === "II.2.1.03") byMonth[m].danaPendamping += pengeluaran;
    }
    return byMonth;
  }, [doorscrieftTransaksis, tahunAktif]);

  const activeData = dataSource === "import" && importData ? importData.bulanan : appData;

  const totalData = useMemo(() => {
    const semesterMonths = semester === 1 ? [1,2,3,4,5,6] : [7,8,9,10,11,12];
    const tot: RekonBulan = { murniPendapatan: 0, murniBelanja: 0, ukpPendapatan: 0, ukpBelanja: 0, dana30: 0, danaYppk1: 0, danaPendamping: 0 };
    for (const m of semesterMonths) {
      const b = activeData[m];
      if (!b) continue;
      tot.murniPendapatan += b.murniPendapatan;
      tot.murniBelanja += b.murniBelanja;
      tot.ukpPendapatan += b.ukpPendapatan;
      tot.ukpBelanja += b.ukpBelanja;
      tot.dana30 += b.dana30;
      tot.danaYppk1 += b.danaYppk1;
      tot.danaPendamping += b.danaPendamping;
    }
    return tot;
  }, [activeData, semester]);

  const saldoAkhir = totalData.murniPendapatan - totalData.murniBelanja;

  const tanggungan = useMemo(() => {
    const pmtl = penetapanMurniTahunLalu || 0;
    const dana69persen = pmtl * 0.69;
    const i1 = Math.round(pmtl * 0.3);
    const y1 = Math.round(pmtl * 0.01);
    const p1 = Math.round(dana69persen * 0.07);
    return {
      bulan6: {
        institusi30: { penetapan: Math.round(i1 / 2), realisasi: Math.round(i1 / 2), selisih: 0 },
        yppk1: { penetapan: Math.round(y1 / 2), realisasi: Math.round(y1 / 2), selisih: 0 },
        pendamping7: { penetapan: Math.round(p1 / 2), realisasi: Math.round(p1 / 2), selisih: 0 },
      },
      tahun1: {
        institusi30: { penetapan: i1, realisasi: i1, selisih: 0 },
        yppk1: { penetapan: y1, realisasi: y1, selisih: 0 },
        pendamping7: { penetapan: p1, realisasi: p1, selisih: 0 },
      },
    };
  }, [penetapanMurniTahunLalu, totalData]);

  
  const handleImport = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.openFile) {
      toast.error("Fitur import hanya tersedia di mode desktop.");
      return;
    }
    try {
      const result = await api.openFile();
      if (!result || (result as Record<string, unknown>).canceled) return;
      const filePath = typeof result === "string" ? result : (result as Record<string, unknown>).path || (result as Record<string, unknown>).filePath;
      if (!filePath) return;
      const excelResult = await api.readExcel(filePath as string);
      if (!excelResult) { toast.error("Gagal membaca file Excel."); return; }
      const data = excelResult as { sheets?: Record<string, { name: string; data: (string | number | null)[][] }> };
      const sheetData = data?.sheets?.REKON?.data || data?.sheets?.[0]?.data;
      if (!sheetData || !Array.isArray(sheetData)) { toast.error("Format file tidak sesuai. Cari sheet 'REKON'."); return; }
      const imported: RekonImportData = { penetapanPendapatan: 0, penetapanBelanja: 0, pendapatanMurniTahunLalu: 0, bulanan: {} };
      let bulanRowStart = -1;
      for (let i = 0; i < sheetData.length; i++) {
        const row = sheetData[i];
        const rowStr = (row || []).map((c) => String(c || ""));
        if (rowStr[0]?.includes("Pendapatan") && !rowStr[0]?.includes("Murni") && String(row[1] || "").match(/\d/)) {
          imported.penetapanPendapatan = parseInt(String(row[1]).replace(/[^0-9.-]/g, "")) || 0;
        }
        if (rowStr[0]?.includes("Belanja") && String(row[1] || "").match(/\d/)) {
          imported.penetapanBelanja = parseInt(String(row[1]).replace(/[^0-9.-]/g, "")) || 0;
        }
        if (rowStr[0]?.includes("Pendapatan Murni") && String(row[1] || "").match(/\d/)) {
          imported.pendapatanMurniTahunLalu = parseInt(String(row[1]).replace(/[^0-9.-]/g, "")) || 0;
        }
        if (rowStr.some((c) => MONTHS.some((m) => c.toLowerCase().includes(m.toLowerCase())))) {
          bulanRowStart = i;
        }
      }
      for (let i = bulanRowStart; i < sheetData.length && bulanRowStart >= 0; i++) {
        const row = sheetData[i];
        if (!row || row.length < 3) continue;
        const rowStr = row.map((c) => String(c || ""));
        if (rowStr[0]?.includes("JUMLAH")) break;
        let monthIdx = -1;
        for (let mi = 0; mi < MONTHS.length; mi++) {
          if (rowStr[1]?.toLowerCase().includes(MONTHS[mi].toLowerCase())) { monthIdx = mi + 1; break; }
        }
        if (monthIdx < 1) continue;
        imported.bulanan[monthIdx] = {
          murniPendapatan: parseFloat(String(row[3] || "0").replace(/[^0-9.-]/g, "")) || 0,
          murniBelanja: parseFloat(String(row[4] || "0").replace(/[^0-9.-]/g, "")) || 0,
          ukpPendapatan: parseFloat(String(row[5] || "0").replace(/[^0-9.-]/g, "")) || 0,
          ukpBelanja: parseFloat(String(row[6] || "0").replace(/[^0-9.-]/g, "")) || 0,
          dana30: parseFloat(String(row[8] || "0").replace(/[^0-9.-]/g, "")) || 0,
          danaYppk1: parseFloat(String(row[9] || "0").replace(/[^0-9.-]/g, "")) || 0,
          danaPendamping: parseFloat(String(row[10] || "0").replace(/[^0-9.-]/g, "")) || 0,
        };
      }
      setImportData(imported);
      saveImportData(tahunAktif, imported);
      setDataSource("import");
      setPenetapanPendapatan(imported.penetapanPendapatan);
      setPenetapanBelanja(imported.penetapanBelanja);
      setPenetapanMurniTahunLalu(imported.pendapatanMurniTahunLalu);
      toast.success("Data rekon berhasil diimport.");
    } catch (e) {
      toast.error("Gagal import: " + (e instanceof Error ? e.message : "Unknown"));
    }
  }, [tahunAktif]);

  const toggleDataSource = useCallback(() => {
    if (dataSource === "app" && importData) setDataSource("import");
    else setDataSource("app");
  }, [dataSource, importData]);

  const fmt = (v: number) => (v ? formatCurrency(v) : "-");

  const handleExport = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.exportRekonKlasis) { toast.error("Export hanya tersedia di mode desktop."); return; }
    const exportMonths = semester === 1 ? [1,2,3,4,5,6] : [7,8,9,10,11,12];
    const bulananData: Record<number, Record<string, number>> = {};
    for (const m of exportMonths) {
      const b = activeData[m] || {};
      bulananData[m] = { murniPendapatan: b.murniPendapatan || 0, murniBelanja: b.murniBelanja || 0, ukpPendapatan: b.ukpPendapatan || 0, ukpBelanja: b.ukpBelanja || 0, dana69: Math.max(0, (b.murniBelanja || 0) - (b.dana30 || 0) - (b.danaYppk1 || 0)), dana30: b.dana30 || 0, danaYppk1: b.danaYppk1 || 0, danaPendamping: b.danaPendamping || 0 };
    }
    try {
      const result = await api.exportRekonKlasis({ tahun: tahunAktif, namaJemaat, namaGereja: "Gereja Protestan Maluku", kopSub: "(ANGGOTA PGI)", klasis: "KLASIS", penandatanganKiriJabatan: "Ketua Majelis Jemaat", penandatanganKiriNama: "", penandatanganKananJabatan: "Bendahara Jemaat", penandatanganKananNama: "", penetapanPendapatan, penetapanBelanja, pendapatanMurniTahunLalu: penetapanMurniTahunLalu, bulanan: bulananData, total: { murniPendapatan: totalData.murniPendapatan, murniBelanja: totalData.murniBelanja, ukpPendapatan: totalData.ukpPendapatan, ukpBelanja: totalData.ukpBelanja, dana69: Math.max(0, totalData.murniBelanja - totalData.dana30 - totalData.danaYppk1), dana30: totalData.dana30, danaYppk1: totalData.danaYppk1, danaPendamping: totalData.danaPendamping }, saldoAkhir, tanggungan });
      if (result.success) {
        toast.success("Rekon Klasis berhasil diexport.", { description: result.path || "" });
      } else if (!(result as Record<string, unknown>).canceled) {
        toast.error("Gagal export: " + ((result as Record<string, unknown>).error || "Unknown"));
      }
    } catch (e) {
      toast.error("Export gagal: " + (e instanceof Error ? e.message : String(e)));
    }
  }, [tahunAktif, namaJemaat, activeData, totalData, saldoAkhir, tanggungan, penetapanPendapatan, penetapanBelanja, penetapanMurniTahunLalu, semester]);
  const dana69 = (b: RekonBulan) => Math.max(0, b.murniBelanja - b.dana30 - b.danaYppk1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Rekon Klasis</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Tahun Anggaran {tahunAktif}</p>
        </div>
      </div>

      {/* Penetapan APB-G */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-600" />
            Penetapan APB-G TA {tahunAktif}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Pendapatan", value: penetapanPendapatan, setter: updatePenetapanPendapatan },
              { label: "Belanja", value: penetapanBelanja, setter: updatePenetapanBelanja },
              { label: "Pendapatan Murni Tahun Lalu (" + (tahunAktif - 2) + ")", value: penetapanMurniTahunLalu, setter: updatePenetapanMurniTahunLalu },
            ].map((item) => (
              <div key={item.label} className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">{item.value ? formatCurrency(item.value) : "Rp 0"}</p>
              </div>
            ))}
          </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-700">
              <span className="text-xs text-slate-500 dark:text-slate-400">Simpan data tahunan. Nanti otomatis dipakai untuk periode rekon berikutnya</span>
              <Button variant="outline" size="sm" onClick={() => {
                setEditYear(String(tahunAktif));
                const existingTahun = loadAnnualYears()[String(tahunAktif)];
                const anggaranDialog = batangTubuhAnggaranByYear[String(tahunAktif)] || {};
                const dialogApbgP = Object.entries(anggaranDialog)
                  .filter(([k]) => k.startsWith("I.") || k === "I")
                  .reduce((s, [, v]) => s + (Number(v) || 0), 0);
                const dialogApbgB = Object.entries(anggaranDialog)
                  .filter(([k]) => k.startsWith("II"))
                  .reduce((s, [, v]) => s + (Number(v) || 0), 0);
                const rtTx = doorscrieftTransaksis.filter(function (tt) {
                  const dd = new Date(tt.tanggal);
                  return !Number.isNaN(dd.getTime()) && dd.getFullYear() === tahunAktif;
                });
                let rtPemasukan = 0, rtPengeluaran = 0;
                for (let ti = 0; ti < rtTx.length; ti++) {
                  const tk = rtTx[ti].kodeAnggaran || "";
                  if (tk.startsWith("I.1") || tk.startsWith("I.2") || tk.startsWith("I.3") || tk.startsWith("I.4") || tk.startsWith("I.5")) {
                    rtPemasukan += Number(rtTx[ti].penerimaan || 0);
                  }
                  if (tk.startsWith("II.1") || tk.startsWith("II.2") || tk.startsWith("II.3") || tk.startsWith("II.4") || tk.startsWith("II.5")) {
                    rtPengeluaran += Number(rtTx[ti].pengeluaran || 0);
                  }
                }
                setEditPemasukan(existingTahun?.pemasukanMurni || rtPemasukan || 0);
                setEditPengeluaran(existingTahun?.pengeluaranMurni || rtPengeluaran || 0);
                setEditSaldo((existingTahun?.pemasukanMurni || rtPemasukan || 0) - (existingTahun?.pengeluaranMurni || rtPengeluaran || 0));
                setEditDianggarkanPendapatan(dialogApbgP);
                setEditDianggarkanPengeluaran(dialogApbgB);
                setShowAnnualData(true);
              }}>
                <Database className="mr-1.5 h-3.5 w-3.5" />
                Data Tahunan
              </Button>
            </div>
        </CardContent>
      </Card>

      {/* Data Source - Import & Export */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              {/* Semester toggle */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Semester:</span>
                <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                  {([1, 2] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSemester(s)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                        semester === s
                          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      )}
                    >
                      Semester {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sumber Data:</span>
                <button
                  onClick={toggleDataSource}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    dataSource === "app"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                  )}
                >
                  {dataSource === "app" ? <Database className="h-3.5 w-3.5" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                  {dataSource === "app" ? "Data Aplikasi" : "Data Klasis"}
                </button>
                {importData && (
                  <button onClick={toggleDataSource} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline">
                    {dataSource === "app" ? "Gunakan Data Klasis" : "Gunakan Data Aplikasi"}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleImport}>
                <Upload className="mr-2 h-4 w-4" />
                Import Excel Klasis
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export Excel
              </Button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <FileText className="h-3.5 w-3.5" />
            Export/print mengikuti format MAPPING REKON.xlsx
          </div>
        </CardContent>
      </Card>

      {/* Tabel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Realisasi Per Bulan - {dataSource === "app" ? "Data Aplikasi" : "Data Klasis"}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                <th className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-300 w-24" rowSpan={2}>Bulan</th>
                <th className="px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-300" colSpan={2}>MURNI</th>
                <th className="px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-300" colSpan={2}>UKP</th>
                <th className="px-3 py-3 text-right font-semibold text-slate-700 dark:text-slate-300" rowSpan={2}>Dana 69%</th>
                <th className="px-3 py-3 text-right font-semibold text-slate-700 dark:text-slate-300" rowSpan={2}>Dana 30%</th>
                <th className="px-3 py-3 text-right font-semibold text-slate-700 dark:text-slate-300" rowSpan={2}>YPPK 1%</th>
                <th className="px-3 py-3 text-right font-semibold text-slate-700 dark:text-slate-300" rowSpan={2}>Pendamping</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              <tr>
                <th></th>
                <th className="px-3 py-2 text-right font-semibold text-slate-500 dark:text-slate-400 text-xs">PENDAPATAN</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-500 dark:text-slate-400 text-xs">BELANJA</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-500 dark:text-slate-400 text-xs">PENDAPATAN</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-500 dark:text-slate-400 text-xs">BELANJA</th>
                <th colSpan={4}></th>
              </tr>
              {(semester === 1 ? [1,2,3,4,5,6] : [7,8,9,10,11,12]).map((m) => {
                const b = activeData[m] || { murniPendapatan: 0, murniBelanja: 0, ukpPendapatan: 0, ukpBelanja: 0, dana30: 0, danaYppk1: 0, danaPendamping: 0 };
                const zero = !b.murniPendapatan && !b.murniBelanja && !b.ukpPendapatan && !b.ukpBelanja && !b.dana30 && !b.danaYppk1 && !b.danaPendamping;
                return (
                  <tr key={m} className={zero ? "text-slate-300 dark:text-slate-600" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}>
                    <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{MONTHS[m-1]}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-300">{fmt(b.murniPendapatan)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-rose-700 dark:text-rose-300">{fmt(b.murniBelanja)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-300">{fmt(b.ukpPendapatan)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-rose-700 dark:text-rose-300">{fmt(b.ukpBelanja)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-blue-700 dark:text-blue-300">{fmt(dana69(b))}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-blue-700 dark:text-blue-300">{fmt(b.dana30)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-blue-700 dark:text-blue-300">{fmt(b.danaYppk1)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-blue-700 dark:text-blue-300">{fmt(b.danaPendamping)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold dark:border-slate-600 dark:bg-slate-800/50">
                <td className="px-3 py-2.5 text-slate-900 dark:text-white">Total</td>
                <td className="px-3 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-300">{fmt(totalData.murniPendapatan)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-rose-700 dark:text-rose-300">{fmt(totalData.murniBelanja)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-300">{fmt(totalData.ukpPendapatan)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-rose-700 dark:text-rose-300">{fmt(totalData.ukpBelanja)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-blue-700 dark:text-blue-300">{fmt(Math.max(0, totalData.murniBelanja - totalData.dana30 - totalData.danaYppk1))}</td>
                <td className="px-3 py-2.5 text-right font-mono text-blue-700 dark:text-blue-300">{fmt(totalData.dana30)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-blue-700 dark:text-blue-300">{fmt(totalData.danaYppk1)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-blue-700 dark:text-blue-300">{fmt(totalData.danaPendamping)}</td>
              </tr>
              <tr className="bg-slate-50 font-bold dark:bg-slate-800/50">
                <td className="px-3 py-2.5 text-slate-900 dark:text-white" colSpan={2}>Saldo Akhir</td>
                <td className="px-3 py-2.5 text-right font-mono text-indigo-700 dark:text-indigo-300" colSpan={7}>{fmt(saldoAkhir)}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

            {/* Export & Tanggungan */}
      <div className="space-y-4">
        {/* Tanggungan - Full Width Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Tanggungan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 6 Bulan & 1 Tahun Side by Side */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tanggungan 6 Bulan</h4>
                <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800">
                        <th className="px-2 py-1.5 text-left font-semibold text-slate-600 dark:text-slate-300">Keterangan</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-slate-600 dark:text-slate-300">Penetapan</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-slate-600 dark:text-slate-300">Realisasi</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-slate-600 dark:text-slate-300">Selisih</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {[
                        { label: "Institusi 30%", d: tanggungan.bulan6.institusi30 },
                        { label: "YPPK 1%", d: tanggungan.bulan6.yppk1 },
                        { label: "Pendamping 7%", d: tanggungan.bulan6.pendamping7 },
                      ].map((item) => (
                        <tr key={item.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{item.label}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">{formatCurrency(item.d.penetapan)}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">{formatCurrency(item.d.realisasi)}</td>
                          <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", item.d.selisih < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white")}>{formatCurrency(item.d.selisih)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tanggungan 1 Tahun</h4>
                <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800">
                        <th className="px-2 py-1.5 text-left font-semibold text-slate-600 dark:text-slate-300">Keterangan</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-slate-600 dark:text-slate-300">Penetapan</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-slate-600 dark:text-slate-300">Realisasi</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-slate-600 dark:text-slate-300">Selisih</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {[
                        { label: "Institusi 30%", d: tanggungan.tahun1.institusi30 },
                        { label: "YPPK 1%", d: tanggungan.tahun1.yppk1 },
                        { label: "Pendamping 7%", d: tanggungan.tahun1.pendamping7 },
                      ].map((item) => (
                        <tr key={item.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{item.label}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">{formatCurrency(item.d.penetapan)}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">{formatCurrency(item.d.realisasi)}</td>
                          <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", item.d.selisih < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white")}>{formatCurrency(item.d.selisih)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {/* Total Akumulasi Dana */}
            {(() => {
              const totalPenetapanTahun1 = 
                tanggungan.tahun1.institusi30.penetapan + 
                tanggungan.tahun1.yppk1.penetapan + 
                tanggungan.tahun1.pendamping7.penetapan;
              const totalRealisasi = 
                tanggungan.tahun1.institusi30.realisasi + 
                tanggungan.tahun1.yppk1.realisasi + 
                tanggungan.tahun1.pendamping7.realisasi;
              const totalSelisih = totalPenetapanTahun1 - totalRealisasi;
              return (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-800 dark:bg-blue-900/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Total Akumulasi Dana (30% + 1% + 7%)</span>
                    <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                      {formatCurrency(totalPenetapanTahun1)}
                    </span>
                  </div>
                </div>
              );
            })()}
            {/* Catatan perbulan - 3 kolom cards */}
            <div>
              <h4 className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Catatan Tanggungan Per Bulan</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-blue-200 bg-white px-3 py-2.5 dark:border-blue-800 dark:bg-slate-800/50">
                  <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400">Institusi 30%</p>
                  <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Rp {(penetapanMurniTahunLalu * 0.3 / 12).toLocaleString("id-ID")}<span className="text-xs font-normal text-slate-500 dark:text-slate-400">/bln</span></p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-white px-3 py-2.5 dark:border-blue-800 dark:bg-slate-800/50">
                  <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400">YPPK 1%</p>
                  <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Rp {(penetapanMurniTahunLalu * 0.01 / 12).toLocaleString("id-ID")}<span className="text-xs font-normal text-slate-500 dark:text-slate-400">/bln</span></p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-white px-3 py-2.5 dark:border-blue-800 dark:bg-slate-800/50">
                  <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400">Pendamping 7% (dari 69%)</p>
                  <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Rp {(penetapanMurniTahunLalu * 0.69 * 0.07 / 12).toLocaleString("id-ID")}<span className="text-xs font-normal text-slate-500 dark:text-slate-400">/bln</span></p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

<Dialog open={showAnnualData} onOpenChange={setShowAnnualData} contentClassName="max-w-md">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Data Tahunan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Tahun</label>
              <input type="number" value={editYear}
                onChange={(e) => {
                const y = e.target.value;
                setEditYear(y);
                const existing = annualYears[y];
                const anggaranY = batangTubuhAnggaranByYear[y] || {};
                const apbgPendapatan = Object.entries(anggaranY)
                  .filter(([k]) => k.startsWith("I.") || k === "I")
                  .reduce((s, [, v]) => s + (Number(v) || 0), 0);
                const apbgBelanja = Object.entries(anggaranY)
                  .filter(([k]) => k.startsWith("II"))
                  .reduce((s, [, v]) => s + (Number(v) || 0), 0);
                let rtP = 0, rtB = 0;
                const tahunY = Number(y);
                if (!Number.isNaN(tahunY)) {
                  for (let ti = 0; ti < doorscrieftTransaksis.length; ti++) {
                    const dd = new Date(doorscrieftTransaksis[ti].tanggal);
                    if (!Number.isNaN(dd.getTime()) && dd.getFullYear() === tahunY) {
                      const tk = doorscrieftTransaksis[ti].kodeAnggaran || "";
                      if (tk.startsWith("I.1") || tk.startsWith("I.2") || tk.startsWith("I.3") || tk.startsWith("I.4") || tk.startsWith("I.5")) {
                        rtP += Number(doorscrieftTransaksis[ti].penerimaan || 0);
                      }
                      if (tk.startsWith("II.1") || tk.startsWith("II.2") || tk.startsWith("II.3") || tk.startsWith("II.4") || tk.startsWith("II.5")) {
                        rtB += Number(doorscrieftTransaksis[ti].pengeluaran || 0);
                      }
                    }
                  }
                }
                if (existing) {
                  setEditPemasukan(existing.pemasukanMurni);
                  setEditPengeluaran(existing.pengeluaranMurni);
                  setEditDianggarkanPendapatan(apbgPendapatan || existing.dianggarkanPendapatan);
                  setEditDianggarkanPengeluaran(apbgBelanja || existing.dianggarkanPengeluaran);
                } else {
                  setEditPemasukan(rtP || 0);
                  setEditPengeluaran(rtB || 0);
                  setEditDianggarkanPendapatan(apbgPendapatan);
                  setEditDianggarkanPengeluaran(apbgBelanja);
                }
              }}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Pemasukan Murni</label>
                <input type="text" value={editPemasukan ? formatCurrency(editPemasukan) : ""}
                  onChange={(e) => setEditPemasukan(parseInt(e.target.value.replace(/[^0-9]/g,""))||0)}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Pengeluaran Murni</label>
                <input type="text" value={editPengeluaran ? formatCurrency(editPengeluaran) : ""}
                  onChange={(e) => setEditPengeluaran(parseInt(e.target.value.replace(/[^0-9]/g,""))||0)}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Saldo</label>
                <input type="text" value={formatCurrency(editPemasukan - editPengeluaran)} readOnly
                  className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400 cursor-not-allowed"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Dianggarkan Pendapatan</label>
                <input type="text" value={editDianggarkanPendapatan ? formatCurrency(editDianggarkanPendapatan) : ""}
                  onChange={(e) => { const v = parseInt(e.target.value.replace(/[^0-9]/g,""))||0; setEditDianggarkanPendapatan(v); }}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Dianggarkan Pengeluaran</label>
                <input type="text" value={editDianggarkanPengeluaran ? formatCurrency(editDianggarkanPengeluaran) : ""}
                  onChange={(e) => setEditDianggarkanPengeluaran(parseInt(e.target.value.replace(/[^0-9]/g,""))||0)}
                  className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
            {Object.keys(annualYears).length > 0 && (
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Data Tersimpan</label>
                <div className="mt-1 space-y-1">
                  {Object.entries(annualYears).sort(([a],[b]) => Number(b)-Number(a)).map(([year, data]) => (
                    <div key={year} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/50">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{year}</span>
                      <span className="text-slate-500">P: {formatCurrency(data.pemasukanMurni)}</span>
                      <span className="text-slate-500">B: {formatCurrency(data.pengeluaranMurni)}</span>
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">Otomatis</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowAnnualData(false)}>Tutup</Button>
              <Button size="sm" onClick={() => {
                const updated = { ...annualYears, [editYear]: { pemasukanMurni: editPemasukan, dianggarkanPendapatan: editDianggarkanPendapatan, dianggarkanPengeluaran: editDianggarkanPengeluaran, pengeluaranMurni: editPengeluaran, saldo: editPemasukan - editPengeluaran } };
                setAnnualYears(updated);
                localStorage.setItem("keuangan-gereja-tahunan", JSON.stringify(updated));
                const simpanTahun = Number(editYear);
                const simpanPrev2 = updated[String(simpanTahun - 2)];
                const simpanMurniLalu = simpanPrev2?.pemasukanMurni || 0;
                if (simpanTahun === tahunAktif) {
                  const simpanAnggaran = batangTubuhAnggaranByYear[String(simpanTahun)] || {};
                  const simpanPendapatan = Object.entries(simpanAnggaran)
                    .filter(([k]) => k.startsWith("I.") || k === "I")
                    .reduce((s, [, v]) => s + (Number(v) || 0), 0);
                  const simpanBelanja = Object.entries(simpanAnggaran)
                    .filter(([k]) => k.startsWith("II"))
                    .reduce((s, [, v]) => s + (Number(v) || 0), 0);
                  setPenetapanPendapatan(simpanPendapatan || penetapanPendapatan);
                  setPenetapanBelanja(simpanBelanja || penetapanBelanja);
                  setPenetapanMurniTahunLalu(simpanMurniLalu);
                  savePenetapan(tahunAktif, { pendapatan: simpanPendapatan || penetapanPendapatan, belanja: simpanBelanja || penetapanBelanja, pendapatanMurniTahunLalu: simpanMurniLalu });
                } else {
                  savePenetapan(tahunAktif, { pendapatan: penetapanPendapatan, belanja: penetapanBelanja, pendapatanMurniTahunLalu: penetapanMurniTahunLalu });
                }
                toast.success("Data tahun " + editYear + " disimpan.");
                setShowAnnualData(false);
              }}>Simpan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>

  );
}
