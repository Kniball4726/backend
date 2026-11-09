import * as fs from 'fs';
import * as zlib from 'zlib';

export interface XlsxRow {
  rowNumber: number;
  cells: Record<string, string | number | boolean>;
}

/**
 * Lector nativo de archivos Excel (.xlsx) sin dependencias externas vulnerables.
 * Utiliza el descompresor DEFLATE nativo de Node.js (zlib.inflateRawSync).
 */
export function readXlsxSheetByName(
  filePath: string,
  sheetName: string,
): XlsxRow[] {
  const entries = readZipEntries(filePath);

  const workbookXml = entries['xl/workbook.xml']?.toString('utf8');
  const relsXml = entries['xl/_rels/workbook.xml.rels']?.toString('utf8');
  if (!workbookXml || !relsXml) {
    throw new Error('El archivo no es un libro .xlsx válido.');
  }

  // 1. Buscar el r:id de la pestaña solicitada (insensible a mayúsculas/minúsculas)
  const sheetTagRegex = /<sheet\s+[^>]*>/g;
  let targetRid: string | null = null;
  let sheetTagMatch: RegExpExecArray | null;

  while ((sheetTagMatch = sheetTagRegex.exec(workbookXml)) !== null) {
    const tag = sheetTagMatch[0];
    const nameMatch = /name="([^"]+)"/.exec(tag);
    const ridMatch = /r:id="([^"]+)"/.exec(tag);
    if (
      nameMatch &&
      ridMatch &&
      nameMatch[1].trim().toLowerCase() === sheetName.trim().toLowerCase()
    ) {
      targetRid = ridMatch[1];
      break;
    }
  }

  if (!targetRid) {
    throw new Error(
      `No se encontró la pestaña "${sheetName}" dentro del archivo Excel.`,
    );
  }

  // 2. Resolver la ruta del archivo XML de la hoja en workbook.xml.rels
  const relTagRegex = /<Relationship\s+[^>]*>/g;
  let targetSheetPath: string | null = null;
  let relTagMatch: RegExpExecArray | null;

  while ((relTagMatch = relTagRegex.exec(relsXml)) !== null) {
    const tag = relTagMatch[0];
    const idMatch = /Id="([^"]+)"/.exec(tag);
    const targetMatch = /Target="([^"]+)"/.exec(tag);
    if (idMatch && targetMatch && idMatch[1] === targetRid) {
      const cleanTarget = targetMatch[1].replace(/^\/+/, '');
      targetSheetPath = cleanTarget.startsWith('xl/')
        ? cleanTarget
        : `xl/${cleanTarget}`;
      break;
    }
  }

  if (!targetSheetPath || !entries[targetSheetPath]) {
    throw new Error(
      `No se encontró el contenido XML (${targetSheetPath}) para la pestaña "${sheetName}".`,
    );
  }

  // 3. Parsear tabla de strings compartidos (xl/sharedStrings.xml)
  const sharedStrings: string[] = [];
  const sharedStringsXml = entries['xl/sharedStrings.xml']?.toString('utf8');
  if (sharedStringsXml) {
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let siMatch: RegExpExecArray | null;
    while ((siMatch = siRegex.exec(sharedStringsXml)) !== null) {
      const inner = siMatch[1];
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let tMatch: RegExpExecArray | null;
      let text = '';
      while ((tMatch = tRegex.exec(inner)) !== null) {
        text += decodeXmlEntities(tMatch[1]);
      }
      sharedStrings.push(text);
    }
  }

  // 4. Parsear filas y celdas de la hoja
  const sheetXml = entries[targetSheetPath].toString('utf8');
  const rows: XlsxRow[] = [];
  const rowRegex = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowNumber = Number(rowMatch[1]);
    const rowContent = rowMatch[2];
    const cells: Record<string, string | number | boolean> = {};
    const cellRegex = /<c\s+r="([A-Z]+)\d+"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const col = cellMatch[1];
      const attrs = cellMatch[2] || '';
      const inner = cellMatch[3] || '';
      const typeMatch = /t="([^"]+)"/.exec(attrs);
      const cellType = typeMatch ? typeMatch[1] : 'n';

      let val: string | number | boolean | null = null;
      if (cellType === 'inlineStr') {
        const tMatch = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
        val = tMatch ? decodeXmlEntities(tMatch[1]) : '';
      } else {
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (vMatch) {
          const rawV = vMatch[1];
          if (cellType === 's') {
            val = sharedStrings[Number(rawV)] ?? rawV;
          } else if (cellType === 'b') {
            val = rawV === '1';
          } else if (cellType === 'str' || cellType === 'e') {
            val = decodeXmlEntities(rawV);
          } else {
            val = Number(rawV);
          }
        }
      }

      if (val !== null && val !== '') {
        cells[col] = val;
      }
    }

    if (Object.keys(cells).length > 0) {
      rows.push({ rowNumber, cells });
    }
  }

  return rows;
}

function readZipEntries(filePath: string): Record<string, Buffer> {
  const buf = fs.readFileSync(filePath);
  const entries: Record<string, Buffer> = {};
  let eocdOffset = -1;

  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Archivo ZIP/XLSX corrupto o inválido.');
  }

  const cdCount = buf.readUInt16LE(eocdOffset + 10);
  let cdOffset = buf.readUInt32LE(eocdOffset + 16);

  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(cdOffset) !== 0x02014b50) break;
    const compressionMethod = buf.readUInt16LE(cdOffset + 10);
    const compressedSize = buf.readUInt32LE(cdOffset + 20);
    const nameLen = buf.readUInt16LE(cdOffset + 28);
    const extraLen = buf.readUInt16LE(cdOffset + 30);
    const commentLen = buf.readUInt16LE(cdOffset + 32);
    const localHeaderOffset = buf.readUInt32LE(cdOffset + 42);
    const name = buf.toString('utf8', cdOffset + 46, cdOffset + 46 + nameLen);

    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      entries[name] = compressedData;
    } else if (compressionMethod === 8) {
      entries[name] = zlib.inflateRawSync(compressedData);
    }
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
