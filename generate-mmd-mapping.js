const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const excelPath = fs.existsSync(path.join(__dirname, 'mmd.xlsx'))
  ? path.join(__dirname, 'mmd.xlsx')
  : path.join(__dirname, 'MMD_SKU.xlsx');

const outputPath = path.join(__dirname, 'src', 'lib', 'mmd-mapping.ts');

if (!fs.existsSync(excelPath)) {
  console.error('Neither mmd.xlsx nor MMD_SKU.xlsx found at', excelPath);
  process.exit(1);
}

console.log('Reading MMD mapping from:', excelPath);
const wb = xlsx.readFile(excelPath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

console.log(`Read ${rows.length} rows from Excel`);

function extractSize(s) {
  const str = String(s || '').toLowerCase();
  const mPack = str.match(/pack\s+of\s+(\d+)/i) || str.match(/(\d+)\s*pcs?/i);
  const mG = str.match(/(\d+(?:\.\d+)?)\s*(?:gm|g|gms|grams?)\b/i);
  const mMl = str.match(/(\d+(?:\.\d+)?)\s*(?:ml|milliliters?)\b/i);
  const mKg = str.match(/(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilograms?)\b/i);
  const mLtr = str.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|liters?|litres?)\b/i);

  let pack = mPack ? parseInt(mPack[1]) : (str.includes('pack of 4') ? 4 : 1);
  let weightG = 0;
  let volMl = 0;

  if (mKg) weightG = Math.round(parseFloat(mKg[1]) * 1000);
  else if (mG) weightG = Math.round(parseFloat(mG[1]));

  if (mLtr) volMl = Math.round(parseFloat(mLtr[1]) * 1000);
  else if (mMl) volMl = Math.round(parseFloat(mMl[1]));

  return { pack, weightG, volMl };
}

function cleanBase(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\|\s*[^|]+$/g, '')
    .replace(/\s*-\s*1\s*(pack|pc|piece|bottle|tin|can|tub|jar|pouch|box)\b/gi, '')
    .replace(/\b(pack|pc|piece|bottle|tin|can|tub|jar|pouch|box)\s+of\s+\d+\b/gi, '')
    .replace(/\b(pack|pc|piece|pouch|tub|jar|can|tin|cup|sp|ip|referigerated)\b/gi, '')
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:gm|g|gms|grams|kg|kgs|ml|l|ltr|liters?|litres?)\b/gi, '')
    .replace(/\bcapella\b/gi, '')
    .replace(/\bper\b/gi, '')
    .replace(/%/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const mapping = {};
const excelEntries = [];

// 1. Ingest all raw entries from Excel
rows.forEach((r) => {
  const sname = String(r['SKU Name'] || '').trim();
  const icode = String(r['Item Code'] || '').trim();
  const code = String(r['MMD Item Code'] || '').trim().toUpperCase();
  const name = String(r['MMD SKU name'] || '').trim();

  if (!code) return;
  const entry = { code, name: name || code };

  if (sname) {
    const rawKey = sname.toLowerCase().replace(/\s+/g, ' ');
    mapping[rawKey] = entry;

    const size = extractSize(sname + ' ' + name);
    const base = cleanBase(sname);
    excelEntries.push({ sname, icode, entry, size, base, raw: rawKey });
  }

  if (icode) {
    const ikey = icode.toLowerCase().replace(/\s+/g, ' ');
    mapping[ikey] = entry;
    excelEntries.push({ sname: '', icode, entry, size: extractSize(name), base: cleanBase(name), raw: ikey });
  }
});

// Helper matching function
function findMatch(sku) {
  const rawKey = sku.toLowerCase().replace(/\s+/g, ' ');
  if (mapping[rawKey]) return mapping[rawKey];

  const skuSize = extractSize(sku);
  const skuBase = cleanBase(sku);

  // 1. Exact base + exact size match
  for (const e of excelEntries) {
    if (e.base && e.base === skuBase) {
      if (skuSize.weightG > 0 && e.size.weightG === skuSize.weightG) {
        if (skuSize.pack === e.size.pack) return e.entry;
      }
      if (skuSize.volMl > 0 && e.size.volMl === skuSize.volMl) {
        if (skuSize.pack === e.size.pack) return e.entry;
      }
      if (skuSize.weightG === 0 && skuSize.volMl === 0 && e.size.weightG === 0 && e.size.volMl === 0) {
        return e.entry;
      }
    }
  }

  // 2. Fuzzy base + exact size match
  if (skuBase.length >= 4) {
    for (const e of excelEntries) {
      if (e.base && (e.base.includes(skuBase) || skuBase.includes(e.base))) {
        if (skuSize.weightG > 0 && e.size.weightG === skuSize.weightG) {
          if (skuSize.pack === e.size.pack) return e.entry;
        }
        if (skuSize.volMl > 0 && e.size.volMl === skuSize.volMl) {
          if (skuSize.pack === e.size.pack) return e.entry;
        }
      }
    }
  }

  // 3. Truncated prefix match (>= 10 chars)
  const norm = sku.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  if (norm.length >= 10) {
    for (const e of excelEntries) {
      const eNorm = e.sname.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      if (eNorm && (eNorm.startsWith(norm) || (norm.startsWith(eNorm) && eNorm.length >= 10))) {
        return e.entry;
      }
    }
  }

  // 4. Edge cases / known dataset aliases
  if (norm.includes('tofu')) {
    return { code: 'PANTF01', name: 'TOFU PANEER 200GM' };
  }
  if (norm.includes('curd pouch') || norm.includes('pouch curd')) {
    return { code: 'PCD0010', name: 'POUCH CURD 400GM' };
  }
  if (norm.includes('set curd tub') && (norm.includes('1 l') || norm.includes('1000'))) {
    return { code: 'SCD0006', name: 'SET CURD 1KG (BUCKET)' };
  }
  if (norm.includes('paneer') && norm.includes('500')) {
    return { code: 'PAN0002', name: 'PANEER 500GM' };
  }
  if (norm.includes('paneer') && (norm.includes('200') || norm.includes('200g'))) {
    return { code: 'PAN0003', name: 'PANEER 200GM' };
  }
  if (norm.includes('single origin') && norm.includes('venez')) {
    return { code: 'CHSO002', name: 'SINGLE ORIGIN - VNZL 125GM' };
  }
  if (norm.includes('dark chocolate 70') && norm.includes('hazelnut')) {
    return { code: 'CHDC008', name: 'DARK CHOCOLATE 70 PER HAZELNUT - 80GM' };
  }
  if (norm.includes('dark chocolate 70') && norm.includes('fruit and nu')) {
    return { code: 'CHDC007', name: 'DARK CHOCOLATE 70 PER FRUIT AND NUT - 80GM' };
  }
  if (norm.includes('milk chocolate fruit and nut')) {
    return { code: 'CHMC004', name: 'MILK CHOCOLATE FRUIT AND NUT 40GM' };
  }
  if (norm.includes('mango') && (norm.includes('ice cream') || norm.includes('ice-cream'))) {
    return { code: 'ICMASQ001', name: 'MANGO 1L' };
  }
  if (norm.includes('butter scotch') && (norm.includes('ice cream') || norm.includes('ice-cream'))) {
    return { code: 'ICBSOV001', name: 'BUTTER SCOTCH 1L' };
  }
  if (norm.includes('tender coconut') && (norm.includes('ice cream') || norm.includes('ice-cream'))) {
    return { code: 'ICTCSQ001', name: 'TENDER COCONUT 1L' };
  }
  if (norm.includes('litchi') && (norm.includes('ice cream') || norm.includes('ice-cream'))) {
    return { code: 'ICLISQ001', name: 'LITCHI 1L' };
  }
  if (norm.includes('orange') && (norm.includes('ice cream') || norm.includes('ice-cream'))) {
    return { code: 'ICORSQ001', name: 'ORANGE 1L' };
  }
  if (norm.includes('mango') && (norm.includes('yoghurt') || norm.includes('yogurt'))) {
    return { code: 'FYM0001', name: 'YOGHURT MANGO 100GM' };
  }
  if (norm.includes('peach') && (norm.includes('yoghurt') || norm.includes('yogurt'))) {
    return { code: 'FYP0001', name: 'YOGHURT PEACH 100GM' };
  }
  if (norm.includes('blueberry') && (norm.includes('yoghurt') || norm.includes('yogurt'))) {
    return { code: 'FYB0001', name: 'YOGHURT BLUEBERRY 100GM' };
  }

  return null;
}

// 2. Pre-map all known dataset SKUs from public/app/data.json if present
const dataJsonPath = path.join(__dirname, 'public', 'app', 'data.json');
if (fs.existsSync(dataJsonPath)) {
  const data = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
  const allSkus = (data.dims && data.dims.sku) || [];

  let matched = 0;
  let unmatched = 0;

  allSkus.forEach((sku) => {
    const rawKey = sku.toLowerCase().replace(/\s+/g, ' ');
    const found = findMatch(sku);
    if (found) {
      mapping[rawKey] = found;
      matched++;
    } else {
      unmatched++;
      console.warn('Unmatched dataset SKU:', sku);
    }
  });

  console.log(`Dataset SKUs processed: ${allSkus.length} (Matched: ${matched}, Unmatched: ${unmatched})`);
}

console.log(`Total unique mappings generated in dictionary: ${Object.keys(mapping).length}`);

// Generate TypeScript file
const sortedKeys = Object.keys(mapping).sort();
const tsContent = `// Auto-generated from mmd.xlsx / MMD_SKU.xlsx (trade SKU name / Item Code -> MMD Item Code / MMD SKU name).
// Keyed by normalized SKU name / Item Code: trim + lowercase + collapse whitespace.
// Regenerate: node generate-mmd-mapping.js

export type MmdEntry = { code: string; name: string };

export const MMD_MAPPING: Record<string, MmdEntry> = {
${sortedKeys
  .map((k) => `  ${JSON.stringify(k)}: { code: ${JSON.stringify(mapping[k].code)}, name: ${JSON.stringify(mapping[k].name)} },`)
  .join('\n')}
};

function extractSize(s: string) {
  const str = String(s || '').toLowerCase();
  const mPack = str.match(/pack\\s+of\\s+(\\d+)/i) || str.match(/(\\d+)\\s*pcs?/i);
  const mG = str.match(/(\\d+(?:\\.\\d+)?)\\s*(?:gm|g|gms|grams?)\\b/i);
  const mMl = str.match(/(\\d+(?:\\.\\d+)?)\\s*(?:ml|milliliters?)\\b/i);
  const mKg = str.match(/(\\d+(?:\\.\\d+)?)\\s*(?:kg|kgs|kilograms?)\\b/i);
  const mLtr = str.match(/(\\d+(?:\\.\\d+)?)\\s*(?:l|ltr|liters?|litres?)\\b/i);

  let pack = mPack ? parseInt(mPack[1]) : (str.includes('pack of 4') ? 4 : 1);
  let weightG = 0;
  let volMl = 0;

  if (mKg) weightG = Math.round(parseFloat(mKg[1]) * 1000);
  else if (mG) weightG = Math.round(parseFloat(mG[1]));

  if (mLtr) volMl = Math.round(parseFloat(mLtr[1]) * 1000);
  else if (mMl) volMl = Math.round(parseFloat(mMl[1]));

  return { pack, weightG, volMl };
}

function cleanBase(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\\|\\s*[^|]+$/g, '')
    .replace(/\\s*-\\s*1\\s*(pack|pc|piece|bottle|tin|can|tub|jar|pouch|box)\\b/gi, '')
    .replace(/\\b(pack|pc|piece|bottle|tin|can|tub|jar|pouch|box)\\s+of\\s+\\d+\\b/gi, '')
    .replace(/\\b(pack|pc|piece|pouch|tub|jar|can|tin|cup|sp|ip|referigerated)\\b/gi, '')
    .replace(/\\b(\\d+(?:\\.\\d+)?)\\s*(?:gm|g|gms|grams|kg|kgs|ml|l|ltr|liters?|litres?)\\b/gi, '')
    .replace(/\\bcapella\\b/gi, '')
    .replace(/\\bper\\b/gi, '')
    .replace(/%/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

export function lookupMmd(skuName: string): MmdEntry | null {
  if (!skuName) return null;
  const directKey = skuName.trim().toLowerCase().replace(/\\s+/g, ' ');
  if (MMD_MAPPING[directKey]) {
    return MMD_MAPPING[directKey];
  }

  const skuSize = extractSize(skuName);
  const skuBase = cleanBase(skuName);

  // Search in MMD_MAPPING keys with size awareness
  for (const [k, entry] of Object.entries(MMD_MAPPING)) {
    const kSize = extractSize(k + ' ' + entry.name);
    const kBase = cleanBase(k);

    if (kBase === skuBase) {
      if (skuSize.weightG > 0 && kSize.weightG === skuSize.weightG && skuSize.pack === kSize.pack) {
        return entry;
      }
      if (skuSize.volMl > 0 && kSize.volMl === skuSize.volMl && skuSize.pack === kSize.pack) {
        return entry;
      }
    }
  }

  // Tofu fallback
  if (skuName.toLowerCase().includes('tofu')) {
    return { code: 'PANTF01', name: 'TOFU PANEER 200GM' };
  }

  return null;
}

/* Merge key for grouping trade SKUs that share one MMD Item Code into a single row.
   Unmapped SKUs keep their own raw name as the group key and display name. */
export function mmdGroup(skuName: string): { key: string; name: string; code: string } {
  const m = lookupMmd(skuName);
  return m
    ? { key: 'mmd:' + m.code, name: m.name, code: m.code }
    : { key: 'sku:' + skuName, name: skuName, code: '' };
}
`;

fs.writeFileSync(outputPath, tsContent, 'utf8');
console.log(`Saved mapping to ${outputPath}`);
