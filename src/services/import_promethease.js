/**
 * Promethease JSON import.
 *
 * Promethease exports SNP analysis results as JSON — an array of objects
 * with rsid, magnitude, summary, genotype, and gene fields. We filter
 * to only pharmacogenomically relevant SNPs (magnitude ≥ 1.5, gene in
 * PGX_GENES) then map each to a genetic_results row.
 */

import { PGX_GENES, PGX_INTERACTIONS } from '../constants/pgx';

export const META = {
  id: 'promethease',
  label: 'Promethease',
  tagline: 'Import pharmacogenomic SNP results from Promethease.',
  accept: '.json',
  inputType: 'json',
  walkthrough: [
    'Open your Promethease report',
    'Download or export as <strong>JSON</strong>',
    'Upload the JSON file below',
  ],
};

const PGX_GENE_SET = new Set(PGX_GENES.map(g => g.toUpperCase()));

const MIN_MAGNITUDE = 1.5;

/**
 * Derive a metabolizer phenotype from the Promethease summary text.
 * Falls back to 'unknown' if no match.
 */
function derivePhenotype(summary) {
  if (!summary) return 'unknown';
  const s = summary.toLowerCase();
  if (s.includes('ultrarapid metabolizer'))     return 'ultrarapid metabolizer';
  if (s.includes('rapid metabolizer'))          return 'rapid metabolizer';
  if (s.includes('poor metabolizer'))           return 'poor metabolizer';
  if (s.includes('intermediate metabolizer'))   return 'intermediate metabolizer';
  if (s.includes('normal metabolizer'))         return 'normal metabolizer';
  if (s.includes('ultrarapid'))                 return 'ultrarapid metabolizer';
  if (s.includes('poor'))                       return 'poor metabolizer';
  if (s.includes('intermediate'))               return 'intermediate metabolizer';
  if (s.includes('normal'))                     return 'normal metabolizer';
  if (s.includes('rapid'))                      return 'rapid metabolizer';
  if (s.includes('increased risk'))             return 'poor metabolizer';
  if (s.includes('decreased function'))         return 'poor metabolizer';
  if (s.includes('reduced function'))           return 'intermediate metabolizer';
  return 'unknown';
}

/**
 * Look up affected drugs from PGX_INTERACTIONS for a gene+phenotype pair.
 */
function getAffectedDrugs(gene, phenotype) {
  if (!gene || !phenotype || phenotype === 'unknown') return [];
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
  if (!input) return false;

  // Handle raw parsed JSON (object/array)
  if (typeof input === 'object') {
    const arr = Array.isArray(input) ? input : input.data || input.snps || input.results;
    if (!Array.isArray(arr) || arr.length === 0) return false;
    const first = arr[0];
    return !!(first && (first.rsid || first.rsId || first.snp));
  }

  // Handle string (try to parse)
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return false;
    try {
      const parsed = JSON.parse(trimmed);
      return detect(parsed);
    } catch {
      return false;
    }
  }

  return false;
}

export function parse(input, { onProgress } = {}) {
  let raw;
  if (typeof input === 'string') {
    raw = JSON.parse(input.trim());
  } else {
    raw = input;
  }

  const arr = Array.isArray(raw) ? raw : raw.data || raw.snps || raw.results || [];
  if (!Array.isArray(arr) || arr.length === 0) {
    return { genetic_results: [], counts: { genetic_results: 0 } };
  }

  const results = [];
  const seen = new Set();

  for (let i = 0; i < arr.length; i++) {
    if (onProgress && i % 500 === 0) onProgress(i / arr.length);

    const snp = arr[i];
    if (!snp) continue;

    const rsid = (snp.rsid || snp.rsId || snp.snp || '').trim();
    const gene = (snp.gene || snp.Gene || '').trim().toUpperCase();
    const magnitude = parseFloat(snp.magnitude || snp.Magnitude || 0);
    const summary = (snp.summary || snp.Summary || snp.description || '').trim();
    const genotype = (snp.genotype || snp.Genotype || '').trim();

    // Filter: must be pharmacogenomically relevant
    if (!gene || !PGX_GENE_SET.has(gene)) continue;
    if (magnitude < MIN_MAGNITUDE) continue;
    if (!rsid) continue;

    // Deduplicate within the file (same gene should not appear multiple times
    // unless different variants)
    const key = `${gene}|${rsid}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const phenotype = derivePhenotype(summary);
    const affected = getAffectedDrugs(gene, phenotype);

    results.push({
      source: 'promethease',
      gene,
      variant: rsid,
      phenotype,
      affected_drugs: affected,
      category: 'pharmacogenomic',
      notes: summary ? summary.slice(0, 500) : '',
    });
  }

  if (onProgress) onProgress(1);

  return {
    genetic_results: results,
    counts: { genetic_results: results.length },
  };
}
