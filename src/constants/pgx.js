// Pharmacogenomic drug-gene interaction lookup table
// Based on FDA Table of Pharmacogenomic Biomarkers + PharmGKB clinical annotations
// Only includes high-confidence, clinically actionable gene-drug pairs

export const PGX_GENES = [
  'CYP2D6', 'CYP2C19', 'CYP3A4', 'CYP2C9', 'CYP1A2',
  'VKORC1', 'MTHFR', 'COMT', 'HLA-B', 'SLCO1B1',
  'DPYD', 'TPMT', 'UGT1A1', 'CYP2B6', 'NUDT15',
];

export const PHENOTYPES = [
  'poor metabolizer',
  'intermediate metabolizer',
  'normal metabolizer',
  'rapid metabolizer',
  'ultrarapid metabolizer',
];

export const PGX_SOURCES = [
  { value: 'genomind', label: 'Genomind' },
  { value: 'genesight', label: 'GeneSight' },
  { value: 'promethease', label: 'Promethease' },
  { value: '23andme', label: '23andMe' },
  { value: 'color', label: 'Color Genomics' },
  { value: 'invitae', label: 'Invitae' },
  { value: 'other', label: 'Other' },
];

// Static drug-gene interactions
// Each entry: gene + phenotype patterns → affected drugs + severity + recommendation
// severity: 'danger' (contraindicated), 'caution' (dose adjust), 'info' (monitor)
export const PGX_INTERACTIONS = [
  // ── CYP2D6 ──────────────────────────────────────────
  {
    gene: 'CYP2D6',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['codeine', 'tramadol', 'hydrocodone', 'oxycodone'],
    msg: 'Reduced conversion to active metabolite — may have reduced pain relief',
    rec: 'Consider non-CYP2D6 alternatives (morphine, oxymorphone)',
  },
  {
    gene: 'CYP2D6',
    phenotypes: ['ultrarapid metabolizer'],
    severity: 'danger',
    drugs: ['codeine', 'tramadol'],
    msg: 'Rapid conversion to active metabolite — risk of toxicity and respiratory depression',
    rec: 'Avoid codeine/tramadol; use alternative analgesics',
  },
  {
    gene: 'CYP2D6',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['fluoxetine', 'paroxetine', 'fluvoxamine', 'venlafaxine', 'atomoxetine', 'duloxetine'],
    msg: 'Elevated drug levels — increased risk of side effects',
    rec: 'Consider dose reduction or alternative SSRI/SNRI (sertraline, escitalopram)',
  },
  {
    gene: 'CYP2D6',
    phenotypes: ['poor metabolizer', 'intermediate metabolizer'],
    severity: 'caution',
    drugs: ['metoprolol', 'carvedilol', 'propranolol', 'timolol'],
    msg: 'Higher beta-blocker levels — risk of bradycardia and hypotension',
    rec: 'Consider dose reduction or alternative beta-blocker (atenolol, bisoprolol)',
  },
  {
    gene: 'CYP2D6',
    phenotypes: ['poor metabolizer', 'intermediate metabolizer'],
    severity: 'caution',
    drugs: ['tamoxifen'],
    msg: 'Reduced conversion to active endoxifen — may reduce efficacy',
    rec: 'Consider aromatase inhibitor alternative if post-menopausal',
  },
  {
    gene: 'CYP2D6',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['aripiprazole', 'haloperidol', 'risperidone', 'perphenazine'],
    msg: 'Elevated antipsychotic levels — increased side effect risk',
    rec: 'Consider dose reduction (50% for aripiprazole)',
  },

  // ── CYP2C19 ─────────────────────────────────────────
  {
    gene: 'CYP2C19',
    phenotypes: ['poor metabolizer', 'intermediate metabolizer'],
    severity: 'danger',
    drugs: ['clopidogrel'],
    msg: 'Reduced activation — significantly reduced antiplatelet effect',
    rec: 'Use prasugrel or ticagrelor instead',
  },
  {
    gene: 'CYP2C19',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['omeprazole', 'esomeprazole', 'lansoprazole', 'pantoprazole'],
    msg: 'Higher PPI levels — increased efficacy but monitor for long-term effects',
    rec: 'May need lower dose; monitor B12 and magnesium',
  },
  {
    gene: 'CYP2C19',
    phenotypes: ['ultrarapid metabolizer'],
    severity: 'caution',
    drugs: ['omeprazole', 'esomeprazole', 'lansoprazole'],
    msg: 'Rapid PPI metabolism — may have reduced acid suppression',
    rec: 'Consider higher dose or alternative PPI (rabeprazole)',
  },
  {
    gene: 'CYP2C19',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['citalopram', 'escitalopram', 'sertraline'],
    msg: 'Elevated SSRI levels — increased side effect risk',
    rec: 'Consider 50% dose reduction',
  },
  {
    gene: 'CYP2C19',
    phenotypes: ['ultrarapid metabolizer'],
    severity: 'caution',
    drugs: ['citalopram', 'escitalopram', 'sertraline', 'amitriptyline', 'clomipramine', 'imipramine'],
    msg: 'Rapid drug metabolism — may have reduced efficacy',
    rec: 'Consider dose increase or alternative antidepressant',
  },
  {
    gene: 'CYP2C19',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['diazepam', 'clobazam'],
    msg: 'Slower benzodiazepine metabolism — prolonged sedation risk',
    rec: 'Consider dose reduction and longer monitoring intervals',
  },

  // ── CYP2C9 ──────────────────────────────────────────
  {
    gene: 'CYP2C9',
    phenotypes: ['poor metabolizer', 'intermediate metabolizer'],
    severity: 'danger',
    drugs: ['warfarin'],
    msg: 'Reduced warfarin metabolism — higher bleeding risk',
    rec: 'Reduce starting dose significantly; use pharmacogenomic dosing algorithm',
  },
  {
    gene: 'CYP2C9',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['celecoxib', 'flurbiprofen', 'piroxicam'],
    msg: 'Higher NSAID levels — increased GI and cardiovascular risk',
    rec: 'Consider 50% dose reduction or alternative analgesic',
  },
  {
    gene: 'CYP2C9',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['phenytoin'],
    msg: 'Reduced phenytoin clearance — toxicity risk',
    rec: 'Reduce dose by 25-50%; monitor levels closely',
  },

  // ── VKORC1 ──────────────────────────────────────────
  {
    gene: 'VKORC1',
    phenotypes: ['poor metabolizer', 'intermediate metabolizer'],
    severity: 'danger',
    drugs: ['warfarin'],
    msg: 'Increased warfarin sensitivity — lower dose needed',
    rec: 'Use pharmacogenomic warfarin dosing calculator (warfarindosing.org)',
  },

  // ── CYP3A4 ──────────────────────────────────────────
  {
    gene: 'CYP3A4',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['tacrolimus', 'cyclosporine', 'sirolimus'],
    msg: 'Elevated immunosuppressant levels — toxicity risk',
    rec: 'Monitor trough levels closely; consider dose reduction',
  },
  {
    gene: 'CYP3A4',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['simvastatin', 'atorvastatin', 'lovastatin'],
    msg: 'Higher statin levels — increased myopathy risk',
    rec: 'Consider lower dose or rosuvastatin/pravastatin (less CYP3A4 dependent)',
  },

  // ── SLCO1B1 ─────────────────────────────────────────
  {
    gene: 'SLCO1B1',
    phenotypes: ['poor metabolizer', 'intermediate metabolizer'],
    severity: 'caution',
    drugs: ['simvastatin', 'atorvastatin', 'rosuvastatin', 'pravastatin'],
    msg: 'Reduced hepatic uptake — higher plasma statin levels, myopathy risk',
    rec: 'Use lowest effective dose; consider pravastatin or fluvastatin',
  },

  // ── DPYD ────────────────────────────────────────────
  {
    gene: 'DPYD',
    phenotypes: ['poor metabolizer', 'intermediate metabolizer'],
    severity: 'danger',
    drugs: ['fluorouracil', '5-fu', 'capecitabine', 'tegafur'],
    msg: 'Severely reduced drug clearance — life-threatening toxicity risk',
    rec: 'Avoid or reduce dose by 50%+; pre-treatment DPYD testing recommended',
  },

  // ── TPMT / NUDT15 ──────────────────────────────────
  {
    gene: 'TPMT',
    phenotypes: ['poor metabolizer', 'intermediate metabolizer'],
    severity: 'danger',
    drugs: ['azathioprine', 'mercaptopurine', 'thioguanine'],
    msg: 'Reduced thiopurine metabolism — severe myelosuppression risk',
    rec: 'Reduce dose to 10% (poor) or 50% (intermediate); monitor CBC weekly',
  },
  {
    gene: 'NUDT15',
    phenotypes: ['poor metabolizer', 'intermediate metabolizer'],
    severity: 'danger',
    drugs: ['azathioprine', 'mercaptopurine', 'thioguanine'],
    msg: 'Reduced thiopurine metabolism — severe myelosuppression risk',
    rec: 'Reduce dose; monitor CBC weekly',
  },

  // ── UGT1A1 ─────────────────────────────────────────
  {
    gene: 'UGT1A1',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['irinotecan', 'atazanavir'],
    msg: 'Reduced drug conjugation — higher active drug levels',
    rec: 'Reduce irinotecan starting dose; monitor for neutropenia',
  },

  // ── HLA-B ──────────────────────────────────────────
  {
    gene: 'HLA-B',
    phenotypes: ['poor metabolizer'],
    severity: 'danger',
    drugs: ['carbamazepine', 'oxcarbazepine', 'phenytoin'],
    msg: 'HLA-B*15:02 carriers: risk of Stevens-Johnson syndrome / toxic epidermal necrolysis',
    rec: 'Avoid in carriers; test before prescribing in at-risk populations',
  },
  {
    gene: 'HLA-B',
    phenotypes: ['poor metabolizer'],
    severity: 'danger',
    drugs: ['abacavir'],
    msg: 'HLA-B*57:01 carriers: risk of severe hypersensitivity reaction',
    rec: 'Contraindicated — must screen before prescribing',
  },
  {
    gene: 'HLA-B',
    phenotypes: ['poor metabolizer'],
    severity: 'danger',
    drugs: ['allopurinol'],
    msg: 'HLA-B*58:01 carriers: risk of severe cutaneous reactions',
    rec: 'Avoid in carriers; consider febuxostat alternative',
  },

  // ── CYP1A2 ─────────────────────────────────────────
  {
    gene: 'CYP1A2',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['clozapine', 'olanzapine', 'duloxetine', 'theophylline'],
    msg: 'Reduced metabolism — higher drug levels and side effects',
    rec: 'Consider dose reduction; monitor for toxicity',
  },
  {
    gene: 'CYP1A2',
    phenotypes: ['ultrarapid metabolizer'],
    severity: 'caution',
    drugs: ['clozapine', 'olanzapine'],
    msg: 'Rapid metabolism — may have subtherapeutic levels',
    rec: 'May need higher doses; monitor therapeutic levels',
  },

  // ── CYP2B6 ─────────────────────────────────────────
  {
    gene: 'CYP2B6',
    phenotypes: ['poor metabolizer'],
    severity: 'caution',
    drugs: ['efavirenz', 'methadone', 'bupropion'],
    msg: 'Reduced metabolism — higher drug levels',
    rec: 'Consider dose reduction; monitor for CNS side effects (efavirenz)',
  },

  // ── COMT ───────────────────────────────────────────
  {
    gene: 'COMT',
    phenotypes: ['poor metabolizer'],
    severity: 'info',
    drugs: ['levodopa', 'methylphenidate', 'amphetamine'],
    msg: 'Slower catecholamine breakdown — may affect dopaminergic drug response',
    rec: 'May be more sensitive to stimulants; monitor response',
  },

  // ── MTHFR ──────────────────────────────────────────
  {
    gene: 'MTHFR',
    phenotypes: ['poor metabolizer', 'intermediate metabolizer'],
    severity: 'info',
    drugs: ['methotrexate', 'folic acid'],
    msg: 'Reduced folate metabolism — may need active folate (methylfolate)',
    rec: 'Consider L-methylfolate supplementation; monitor homocysteine',
  },
];

// Look up PGx interactions for a medication name given user's genetic results
export function findPgxMatches(medName, geneticResults) {
  if (!medName || !geneticResults?.length) return [];
  const name = medName.toLowerCase().trim();

  const matches = [];
  for (const result of geneticResults) {
    const gene = result.gene?.toUpperCase();
    const phenotype = result.phenotype?.toLowerCase();
    if (!gene || !phenotype) continue;

    for (const rule of PGX_INTERACTIONS) {
      if (rule.gene !== gene) continue;
      if (!rule.phenotypes.includes(phenotype)) continue;
      if (!rule.drugs.some(d => name.includes(d) || d.includes(name))) continue;

      matches.push({
        gene: rule.gene,
        phenotype: result.phenotype,
        severity: rule.severity,
        msg: rule.msg,
        rec: rule.rec,
      });
    }
  }
  return matches;
}
