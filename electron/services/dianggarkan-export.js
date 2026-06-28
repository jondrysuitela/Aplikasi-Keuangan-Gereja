const { BatangTubuhExportService } = require('./batang-tubuh-export');

const NUMBER_FORMAT_RP = '#,##0';

function cellToString(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('').trim();
    if (value.text) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    if (value.formula) return String(value.result || '').trim();
  }
  return String(value).trim();
}

function normalizeKode(value) {
  const kode = cellToString(value).replace(/\s+/g, '').toUpperCase();
  return kode.startsWith('1.') ? `I.${kode.slice(2)}` : kode;
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

class DianggarkanExportService extends BatangTubuhExportService {
  async export(hierarchicalData = [], config = {}) {
    const year = Number(config.tahun) || new Date().getFullYear();
    const buffer = await super.export(hierarchicalData, {
      ...config,
    });
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet('BATANG TUBUH');
    if (!worksheet) throw new Error('Sheet BATANG TUBUH tidak ditemukan');

    worksheet.getCell('A5').value = `RANCANGAN ANGGARAN PENDAPATAN DAN BELANJA TAHUN ${year}`;
    worksheet.getCell('C7').value = `DIANGGARKAN ${year}`;
    worksheet.getCell('D7').value = `REALISASI ${year}`;
    worksheet.getCell('E7').value = 'KETERANGAN';
    worksheet.getCell('C8').value = `DIANGGARKAN ${year}`;
    worksheet.getCell('D8').value = `REALISASI ${year}`;
    worksheet.getCell('E8').value = 'KETERANGAN';
    worksheet.getCell('C9').value = 3;
    worksheet.getCell('D9').value = 4;
    worksheet.getCell('E9').value = 5;

    const detailMap = this._buildProgramDetailMap(config.batangTubuhProgramByYear || {}, year);
    const insertQueue = [];
    for (let rowNumber = 10; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const kode = normalizeKode(worksheet.getCell(`A${rowNumber}`).value);
      const details = detailMap.get(kode) || [];
      const detail = details[0] || null;
      worksheet.getCell(`E${rowNumber}`).value = detail?.value || null;
      worksheet.getCell(`E${rowNumber}`).alignment = { vertical: 'top', wrapText: true };
      worksheet.getCell(`F${rowNumber}`).value = null;
      const detailText = detail?.text || '';
      if (detailText) worksheet.getRow(rowNumber).height = Math.max(28, Math.min(120, detailText.split('\n').length * 15));
      if (details.length > 1) insertQueue.push({ rowNumber, details: details.slice(1) });
    }

    insertQueue.slice().reverse().forEach(({ rowNumber, details }) => {
      details.slice().reverse().forEach((detail) => {
        worksheet.insertRow(rowNumber + 1, []);
        this._styleProgramDetailRow(worksheet, rowNumber, rowNumber + 1, detail);
      });
    });

    worksheet.getColumn(1).width = 18;
    worksheet.getColumn(2).width = 74;
    worksheet.getColumn(3).width = 22;
    worksheet.getColumn(4).width = 22;
    worksheet.getColumn(5).width = 70;
    worksheet.getColumn(5).hidden = false;
    worksheet.getColumn(6).hidden = true;

    for (let rowNumber = 10; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      worksheet.getCell(`C${rowNumber}`).numFmt = NUMBER_FORMAT_RP;
      worksheet.getCell(`D${rowNumber}`).numFmt = NUMBER_FORMAT_RP;
    }

    worksheet.pageSetup = {
      ...worksheet.pageSetup,
      orientation: 'landscape',
      printArea: `A1:E${worksheet.rowCount}`,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };

    workbook.modified = new Date();
    return workbook.xlsx.writeBuffer();
  }

  _styleProgramDetailRow(worksheet, sourceRowNumber, targetRowNumber, detail) {
    const sourceRow = worksheet.getRow(sourceRowNumber);
    const targetRow = worksheet.getRow(targetRowNumber);
    for (let column = 1; column <= 6; column += 1) {
      const sourceCell = sourceRow.getCell(column);
      const targetCell = targetRow.getCell(column);
      targetCell.style = JSON.parse(JSON.stringify(sourceCell.style || {}));
      targetCell.value = null;
    }

    targetRow.getCell(5).value = detail.value;
    targetRow.getCell(5).alignment = { vertical: 'top', wrapText: true };
    const detailText = detail.text || '';
    targetRow.height = Math.max(28, Math.min(120, detailText.split('\n').length * 15));
    targetRow.commit();
  }

  _buildProgramDetailMap(programByYear, year) {
    const map = new Map();
    const yearPrograms = programByYear && typeof programByYear === 'object'
      ? (programByYear[String(year)] || programByYear[year] || {})
      : {};

    Object.entries(yearPrograms).forEach(([rawKode, programs]) => {
      if (!Array.isArray(programs)) return;
      const details = programs.map((program) => {
        const rincianRows = Array.isArray(program?.rincian) ? program.rincian : [];
        const totalProgram = rincianRows.reduce((sum, rincian) => sum + toNumber(rincian?.jumlah), 0);
        const namaProgram = program?.namaProgram || 'Program Umum';
        const programSuffix = totalProgram > 0 ? ` (${this._formatAmount(totalProgram)})` : '';
        const lines = [`${namaProgram}${programSuffix}`];
        rincianRows.forEach((rincian) => {
          lines.push(`- ${rincian?.keterangan || 'Rincian'}: ${this._formatAmount(rincian?.jumlah)}`);
        });
        const detailText = lines.join('\n');
        return {
          text: detailText,
          value: {
            richText: [
              { text: namaProgram, font: { bold: true } },
              { text: `${programSuffix}${lines.length > 1 ? '\n' : ''}` },
              ...lines.slice(1).map((line, index) => ({
                text: `${line}${index < lines.length - 2 ? '\n' : ''}`,
              })),
            ],
          },
        };
      }).filter(Boolean);
      if (details.length > 0) map.set(normalizeKode(rawKode), details);
    });

    return map;
  }

  _formatAmount(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(toNumber(value));
  }
}

module.exports = { DianggarkanExportService };
