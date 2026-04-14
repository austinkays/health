// ── Universal file type detection for imports ──
// Given a File, identify which parser should handle it.
// Returns { parser, label, module } or null if unrecognized.
//
// Handles three detection strategies:
//   1. Text files (CSV/XML): read as text, run each parser's detect()
//   2. ZIP files: peek at file signatures inside the archive
//   3. JSON files: inspect the top-level structure
//
// Text parsers (Clue, Bearable, Visible, etc.) already have reliable
// detect() functions that sniff CSV headers. ZIP parsers all return
// true in their detect() because they need to unpack first, so we
// have to identify ZIPs by filename signatures instead.

import * as clueParser from '../services/import_clue';
import * as naturalCyclesParser from '../services/import_natural_cycles';
import * as daylioParser from '../services/import_daylio';
import * as bearableParser from '../services/import_bearable';
import * as visibleParser from '../services/import_visible';
import * as libreParser from '../services/import_libre';
import * as mysugrParser from '../services/import_mysugr';
import * as sleepCycleParser from '../services/import_sleep_cycle';
import * as stravaParser from '../services/import_strava';
import * as samsungParser from '../services/import_samsung';
import * as garminParser from '../services/import_garmin';
import * as fitbitTakeoutParser from '../services/import_fitbit_takeout';
import * as googleFitParser from '../services/import_google_fit';
import { readFileAsText, readFileAsArrayBuffer } from '../services/_parse';

// Text-based parsers (CSVs). Order matters — more specific detectors first,
// generic ones last. Each parser's detect() sniffs for specific CSV headers.
const TEXT_PARSERS = [
  visibleParser,       // observation_date + tracker_name
  bearableParser,      // category + rating + detail
  clueParser,          // period/bleeding/flow columns
  naturalCyclesParser, // BBT columns
  daylioParser,        // mood + activities
  libreParser,         // LibreView glucose headers
  mysugrParser,        // mySugr glucose headers
  sleepCycleParser,    // sleep cycle headers
  stravaParser,        // activities.csv (standalone)
];

// ZIP signatures: peek at filenames inside the archive to identify source.
// Returns the parser module or null. Order matters (more specific first).
async function detectZip(arrayBuffer) {
  let JSZip;
  try {
    JSZip = (await import('jszip')).default;
  } catch {
    return null;
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch {
    return null;
  }

  const files = Object.keys(zip.files || {}).filter(n => !zip.files[n].dir);
  if (!files.length) return null;

  // Samsung Health: com.samsung.shealth.<metric>.csv
  if (files.some(f => /com\.samsung\.shealth/i.test(f))) {
    return { module: samsungParser, zipInstance: zip };
  }

  // Garmin Connect: DI-Connect-*.json
  if (files.some(f => /DI-Connect|garmin/i.test(f))) {
    return { module: garminParser, zipInstance: zip };
  }

  // Fitbit Google Takeout: /Fitbit/ folder with steps-YYYY-MM-DD.json
  if (files.some(f => /\/Fitbit\//i.test(f)) || files.some(f => /\/steps-\d{4}/i.test(f) && /fitbit/i.test(f))) {
    return { module: fitbitTakeoutParser, zipInstance: zip };
  }

  // Google Fit Takeout: Takeout/Fit/ folder
  if (files.some(f => /Takeout\/Fit|Daily activity metrics/i.test(f))) {
    return { module: googleFitParser, zipInstance: zip };
  }

  // Strava bulk export: activities.csv at root
  if (files.some(f => /^activities\.csv$/i.test(f) || /\/activities\.csv$/i.test(f))) {
    return { module: stravaParser, zipInstance: zip };
  }

  return null;
}

// Detect text-based CSV parser by running each detector in order.
function detectText(text) {
  for (const parser of TEXT_PARSERS) {
    try {
      if (parser.detect && parser.detect(text)) {
        return parser;
      }
    } catch { /* skip broken detectors */ }
  }
  return null;
}

/**
 * Identify which import parser should handle a file.
 *
 * @param {File} file
 * @returns {Promise<{ module, label, input, inputKind } | null>}
 *   module = parser module
 *   label = human label for display
 *   input = the raw text/arrayBuffer/zip instance ready for parse()
 *   inputKind = 'text' | 'zip' (tells ImportWizard whether to re-read)
 */
export async function detectImportFile(file) {
  if (!file) return null;
  const name = (file.name || '').toLowerCase();

  // ── ZIP files ──
  if (name.endsWith('.zip')) {
    const buf = await readFileAsArrayBuffer(file);
    const match = await detectZip(buf);
    if (match) {
      return {
        module: match.module,
        label: match.module.META.label,
        input: match.zipInstance,
        inputKind: 'zip',
      };
    }
    return null;
  }

  // ── JSON files (future: Flo, Salve backup) ──
  // Not yet routed — user still clicks explicit card for these.

  // ── Text files (CSV / TXT / TSV / XML fallthrough for now) ──
  const text = await readFileAsText(file);
  const match = detectText(text);
  if (match) {
    return {
      module: match,
      label: match.META.label,
      input: text,
      inputKind: 'text',
    };
  }

  return null;
}
