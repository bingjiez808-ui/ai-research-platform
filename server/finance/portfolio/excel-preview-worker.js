import { parentPort, workerData } from 'node:worker_threads';
import ExcelJS from 'exceljs';

function scalar(cell) {
  const value = cell.value;
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) throw new Error(`Formula cells are not allowed (${cell.address})`);
    if ('text' in value) return String(value.text);
    if ('result' in value) return value.result;
    throw new Error(`Unsupported Excel cell type (${cell.address})`);
  }
  return value;
}

async function parse() {
  const { buffer, maxSheets, maxRows } = workerData;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer), {
    ignoreNodes: ['dataValidations', 'conditionalFormatting', 'extLst'],
  });
  if (!workbook.worksheets.length) throw new Error('Excel workbook has no worksheet');
  if (workbook.worksheets.length > maxSheets) throw new Error(`Workbook exceeds sheet limit (${maxSheets})`);
  const sheet = workbook.worksheets[0];
  if (sheet.actualRowCount < 2) throw new Error('Excel worksheet has no data rows');
  if (sheet.actualRowCount - 1 > maxRows) throw new Error(`Worksheet exceeds row limit (${maxRows})`);
  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    const header = String(scalar(cell) ?? '').trim();
    if (header.length > 64) throw new Error(`Header at column ${column} exceeds 64 characters`);
    headers[column - 1] = header;
  });
  if (!headers.some(Boolean)) throw new Error('Excel header row is empty');
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, index) => {
    if (index === 1) return;
    const record = {};
    headers.forEach((header, column) => {
      if (header) record[header] = scalar(row.getCell(column + 1));
    });
    if (Object.values(record).some(value => value !== null && String(value).trim() !== '')) rows.push(record);
  });
  if (rows.length > maxRows) throw new Error(`Worksheet exceeds row limit (${maxRows})`);
  return { sheetCount: workbook.worksheets.length, sheetName: sheet.name, rows };
}

parse().then(data => parentPort.postMessage({ ok: true, data })).catch(error => parentPort.postMessage({ ok: false, error: error.message }));
