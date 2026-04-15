/**
 * 23andMe raw DNA file import.
 *
 * 23andMe provides a tab-separated text file (`genome_Full_*.txt`)
 * with columns: rsid, chromosome, position, genotype.
 * Comment lines start with #.
 *
 * We cross-reference each rsID against a curated pharmacogenomic SNP
 * lookup built from FDA/PharmGKB clinical annotations, and only import
 * the rows that are clinically relevant for drug metabolism.
 */

import { PGX_INTERACTIONS } from '../constants/pgx';
import { readFileAsText } from './_parse';

export const META = {
  id: '23andme',
  label: '23andMe',
  tagline: 'Import pharmacogenomic variants from 23andMe raw data.',
  accept: '.txt,.zip',
  inputType: 'text',
  walkthrough: [
    'Go to <strong>23andMe.com</strong> → Settings → 23andMe Data',
    'Click <strong>Download Raw Data</strong>',
    'Save the <code>.txt</code> file to your device',
    'Upload the file below',
  ],
};

/**
 * Curated map of pharmacogenomically relevant SNPs.
 * rsID → { gene, phenotype_map: { genotype → phenotype } }
 *
 * Based on FDA Table of Pharmacogenomic Biomarkers + PharmGKB
 * clinical annotations. Only star allele-defining or high-confidence
 * functional SNPs are included.
 *
 * In practice, 23andMe raw data has limited coverage of full star
 * alleles (CYP2D6 requires copy number analysis), but these tag SNPs
 * provide useful signal for single-gene metabolizer inference.
 */
const PGX_SNP_MAP = {
  // ── CYP2D6 ──
  'rs3892097':  { gene: 'CYP2D6', phenotype_map: { AA: 'poor metabolizer', AG: 'intermediate metabolizer', GG: 'normal metabolizer' } },        // *4 tag SNP
  'rs1065852':  { gene: 'CYP2D6', phenotype_map: { AA: 'poor metabolizer', AG: 'intermediate metabolizer', GG: 'normal metabolizer' } },        // *10 tag SNP
  'rs5030655':  { gene: 'CYP2D6', phenotype_map: { del: 'poor metabolizer', 'A-': 'intermediate metabolizer' } },                                // *6
  'rs16947':    { gene: 'CYP2D6', phenotype_map: { AA: 'intermediate metabolizer', AG: 'normal metabolizer', GG: 'normal metabolizer' } },      // *2 tag

  // ── CYP2C19 ──
  'rs4244285':  { gene: 'CYP2C19', phenotype_map: { AA: 'poor metabolizer', AG: 'intermediate metabolizer', GG: 'normal metabolizer' } },       // *2
  'rs4986893':  { gene: 'CYP2C19', phenotype_map: { AA: 'poor metabolizer', AG: 'intermediate metabolizer', GG: 'normal metabolizer' } },       // *3
  'rs12248560': { gene: 'CYP2C19', phenotype_map: { TT: 'ultrarapid metabolizer', CT: 'rapid metabolizer', CC: 'normal metabolizer' } },        // *17

  // ── CYP2C9 ──
  'rs1799853':  { gene: 'CYP2C9', phenotype_map: { TT: 'poor metabolizer', CT: 'intermediate metabolizer', CC: 'normal metabolizer' } },        // *2
  'rs1057910':  { gene: 'CYP2C9', phenotype_map: { CC: 'poor metabolizer', AC: 'intermediate metabolizer', AA: 'normal metabolizer' } },        // *3

  // ── CYP3A4 ──
  'rs35599367': { gene: 'CYP3A4', phenotype_map: { TT: 'poor metabolizer', CT: 'intermediate metabolizer', CC: 'normal metabolizer' } },        // *22

  // ── CYP1A2 ──
  'rs762551':   { gene: 'CYP1A2', phenotype_map: { AA: 'ultrarapid metabolizer', AC: 'rapid metabolizer', CC: 'normal metabolizer' } },         // *1F

  // ── CYP2B6 ──
  'rs3745274':  { gene: 'CYP2B6', phenotype_map: { TT: 'poor metabolizer', GT: 'intermediate metabolizer', GG: 'normal metabolizer' } },        // *6

  // ── VKORC1 ──
  'rs9923231':  { gene: 'VKORC1', phenotype_map: { TT: 'poor metabolizer', CT: 'intermediate metabolizer', CC: 'normal metabolizer' } },        // warfarin sensitivity

  // ── SLCO1B1 ──
  'rs4149056':  { gene: 'SLCO1B1', phenotype_map: { CC: 'poor metabolizer', CT: 'intermediate metabolizer', TT: 'normal metabolizer' } },       // statin myopathy

  // ── DPYD ──
  'rs3918290':  { gene: 'DPYD', phenotype_map: { AA: 'poor metabolizer', AG: 'intermediate metabolizer', GG: 'normal metabolizer' } },           // *2A
  'rs55886062': { gene: 'DPYD', phenotype_map: { AA: 'poor metabolizer', AC: 'intermediate metabolizer', CC: 'normal metabolizer' } },           // *13

  // ── TPMT ──
  'rs1800462':  { gene: 'TPMT', phenotype_map: { AA: 'poor metabolizer', AG: 'intermediate metabolizer', GG: 'normal metabolizer' } },           // *2
  'rs1800460':  { gene: 'TPMT', phenotype_map: { AA: 'poor metabolizer', AC: 'intermediate metabolizer', CC: 'normal metabolizer' } },           // *3B
  'rs1142345':  { gene: 'TPMT', phenotype_map: { CC: 'poor metabolizer', AC: 'intermediate metabolizer', AA: 'normal metabolizer' } },           // *3C

  // ── NUDT15 ──
  'rs116855232': { gene: 'NUDT15', phenotype_map: { TT: 'poor metabolizer', CT: 'intermediate metabolizer', CC: 'normal metabolizer' } },

  // ── UGT1A1 ──
  'rs8175347':  { gene: 'UGT1A1', phenotype_map: { '7/7': 'poor metabolizer', '6/7': 'intermediate metabolizer', '6/6': 'normal metabolizer' } }, // *28

  // ── HLA-B (presence/absence risk alleles) ──
  'rs2395029':  { gene: 'HLA-B', phenotype_map: { TT: 'normal metabolizer', GT: 'poor metabolizer', GG: 'poor metabolizer' } },                  // *57:01 tag (abacavir)
  'rs3909184':  { gene: 'HLA-B', phenotype_map: { CC: 'normal metabolizer', CT: 'poor metabolizer', TT: 'poor metabolizer' } },                  // *15:02 tag (carbamazepine)

  // ── COMT ──
  'rs4680':     { gene: 'COMT', phenotype_map: { AA: 'poor metabolizer', AG: 'intermediate metabolizer', GG: 'normal metabolizer' } },            // Val158Met

  // ── MTHFR ──
  'rs1801133':  { gene: 'MTHFR', phenotype_map: { AA: 'poor metabolizer', AG: 'intermediate metabolizer', GG: 'normal metabolizer' } },           // C677T
  'rs1801131':  { gene: 'MTHFR', phenotype_map: { CC: 'poor metabolizer', AC: 'intermediate metabolizer', AA: 'normal metabolizer' } },           // A1298C
};

/**
 * Look up affected drugs from PGX_INTERACTIONS for a gene+phenotype pair.
 */
function getAffectedDrugs(gene, phenotype) {
  if (!gene || !phenotype || phenotype === 'normal metabolizer') return [];
  const gUpper = gene.toUpperCase();
  const pLower = phenotype.toLowerCase();
  const drugs = new Set();
  for (const rule of PGX_INTERACTIONS) {
    if (rule.gene === gUpper && rule.phenotypes.includes(pLower)) {
      rule.drugs.forEach(d => drugs.add(d));
    }
  }
  return [...drugs].sort();
}

export function detect(input) {
  if (!input || typeof input !== 'string') return false;
  const head = input.slice(0, 5000);
  // 23andMe raw data starts with # comment lines and has rsid/chromosome/position/genotype
  return (
    head.includes('# rsid') ||
    head.includes('rsid\tchromosome\tposition\tgenotype') ||
    (head.includes('rsid') && head.includes('chromosome') && head.includes('genotype'))
  );
}

export function parse(input, { onProgress } = {}) {
  if (!input || typeof input !== 'string') {
    return { genetic_results: [], counts: { genetic_results: 0 } };
  }

  const lines = input.split('\n');
  const results = [];
  const seen = new Set();
  let dataStarted = false;

  for (let i = 0; i < lines.length; i++) {
    if (onProgress && i % 10000 === 0) onProgress(i / lines.length);

    const line = lines[i].trim();

    // Skip comment lines
    if (line.startsWith('#') || line === '') continue;

    // Detect header line (skip it)
    if (!dataStarted) {
      if (line.toLowerCase().includes('rsid') && line.includes('\t')) {
        dataStarted = true;
        continue;
      }
      // If it looks like data already (starts with rs), process it
      if (line.startsWith('rs')) {
        dataStarted = true;
      } else {
        continue;
      }
    }

    const parts = line.split('\t');
    if (parts.length < 4) continue;

    const rsid = parts[0].trim().toLowerCase();
    const genotype = parts[3].trim().toUpperCase();

    if (!rsid || !genotype || genotype === '--' || genotype === '00') continue;

    // Look up in our PGX SNP map
    const entry = PGX_SNP_MAP[rsid];
    if (!entry) continue;

    const gene = entry.gene;

    // Try to match the genotype to a phenotype
    // 23andMe may report as "AG" while our map has "GA" — try both orders
    let phenotype = entry.phenotype_map[genotype];
    if (!phenotype && genotype.length === 2) {
      phenotype = entry.phenotype_map[genotype[1] + genotype[0]];
    }
    if (!phenotype) {
      // Unrecognized genotype for this SNP — still import with unknown
      phenotype = 'unknown';
    }

    // Deduplicate within file (same gene from different SNPs — keep most informative)
    const key = `${gene}|${rsid}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const affected = getAffectedDrugs(gene, phenotype);

    results.push({
      source: '23andme',
      gene,
      variant: rsid,
      phenotype,
      affected_drugs: affected,
      category: 'pharmacogenomic',
      notes: `Genotype: ${genotype}`,
    });
  }

  if (onProgress) onProgress(1);

  return {
    genetic_results: results,
    counts: { genetic_results: results.length },
  };
}
