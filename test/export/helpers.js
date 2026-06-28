const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

function getTemplatePath() {
  return path.join(process.cwd(), 'data', 'MAPPING.xlsx');
}

async function loadWorkbookFromBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function getCellText(cell) {
  if (!cell) return '';
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value.text) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    if (Array.isArray(value.richText)) return value.richText.map((part) => String(part.text || '')).join('').trim();
    if (value.formula) return String(value.result || '').trim();
    return '';
  }
  return String(value).trim();
}

function getCellFormula(cell) {
  if (!cell || !cell.value || typeof cell.value !== 'object') return null;
  return cell.value.formula || null;
}

function getNumberValue(cell) {
  if (!cell) return null;
  const value = cell.value;
  if (value == null) return null;
  if (typeof value === 'object') {
    if (typeof value.result === 'number') return value.result;
    if (typeof value.value === 'number') return value.value;
    return null;
  }
  return typeof value === 'number' ? value : null;
}

function findRowByCode(worksheet, column, codeValue) {
  const normalized = String(codeValue || '').trim().toUpperCase();
  for (let row = 1; row <= worksheet.rowCount; row += 1) {
    const cell = worksheet.getCell(`${column}${row}`);
    if (String(getCellText(cell)).trim().toUpperCase() === normalized) {
      return row;
    }
  }
  return -1;
}

module.exports = {
  getTemplatePath,
  loadWorkbookFromBuffer,
  getCellText,
  getCellFormula,
  getNumberValue,
  findRowByCode,
};