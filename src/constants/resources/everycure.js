// EveryCure drug repurposing portfolio
// Source: https://everycure.org/portfolio/ (accessed April 2026)
// Every Cure uses AI to identify and advance promising drug repurposing
// opportunities for conditions with high unmet medical need.

const EVERYCURE_PROGRAMS = [
  // ── FRONTIER EXPLORERS (undertaking additional laboratory studies) ──────

  {
    id: 'ec-beta-blocker-neurodegeneration',
    title: 'Beta Blocker for Rare Neurodegenerative Disease',
    url: 'https://everycure.org/portfolio/',
    source: 'EveryCure',
    blurb:
      'Every Cure is investigating the repurposing of a beta blocker for a rare neurodegenerative disease, currently in preclinical laboratory studies.',
    conditions: ['neurodegenerative disease'],
    symptomTags: ['tremor', 'neurodegeneration', 'movement'],
    medications: [],
    audience: 'self',
    researchStage: 'active',
  },
  {
    id: 'ec-epigenetic-muscle-degeneration',
    title: 'Epigenetic Modifier for Muscle Degenerative Disorder',
    url: 'https://everycure.org/portfolio/',
    source: 'EveryCure',
    blurb:
      'Every Cure is studying an epigenetic modifier as a potential treatment for a muscle degenerative disorder, currently in preclinical laboratory studies.',
    conditions: ['muscular dystrophy', 'muscle degenerative disorder'],
    symptomTags: ['muscle weakness', 'weakness'],
    medications: [],
    audience: 'self',
    researchStage: 'active',
  },

  // ── CLINICAL GEMS (undertaking additional clinical studies) ────────────

  {
    id: 'ec-metabolic-modifier-fibrotic-lung',
    title: 'Metabolic Modifier for Fibrotic Lung Disease',
    url: 'https://everycure.org/portfolio/',
    source: 'EveryCure',
    blurb:
      'Every Cure is advancing a metabolic modifier for fibrotic lung disease through additional clinical studies to evaluate its potential for patients with pulmonary fibrosis.',
    conditions: ['pulmonary fibrosis', 'idiopathic pulmonary fibrosis', 'fibrotic lung disease'],
    symptomTags: ['shortness of breath', 'cough', 'breathing'],
    medications: [],
    audience: 'self',
    researchStage: 'active',
  },
  {
    id: 'ec-immune-modulator-vascular-malignancy',
    title: 'Immune Modulator for Rare Vascular Malignancy',
    url: 'https://everycure.org/portfolio/',
    source: 'EveryCure',
    blurb:
      'Every Cure is studying an immune modulator as a potential treatment for a rare vascular malignancy, currently undergoing clinical investigation.',
    conditions: ['vascular malignancy', 'angiosarcoma'],
    symptomTags: ['cancer'],
    medications: [],
    audience: 'self',
    researchStage: 'active',
  },
  {
    id: 'ec-small-molecule-genetic-syndrome',
    title: 'Small Molecule for Rare Genetic Syndrome',
    url: 'https://everycure.org/portfolio/',
    source: 'EveryCure',
    blurb:
      'Every Cure is investigating a small molecule for a rare genetic syndrome. Additional details to be announced as the program progresses through clinical studies.',
    conditions: ['rare genetic syndrome'],
    symptomTags: [],
    medications: [],
    audience: 'self',
    researchStage: 'active',
  },

  // ── UNSUNG HEROES (sufficient clinical evidence) ───────────────────────

  {
    id: 'ec-dfmo-bachmann-bupp',
    title: 'DFMO (Eflornithine) for Bachmann-Bupp Syndrome',
    url: 'https://everycure.org/portfolio/',
    source: 'EveryCure',
    blurb:
      'Every Cure supports the use of DFMO (DL-alpha-difluoromethylornithine, also known as eflornithine) for Bachmann-Bupp syndrome (BABS), an ultra-rare genetic condition. Clinical evidence supports this repurposing.',
    conditions: ['bachmann-bupp syndrome'],
    symptomTags: ['developmental delay'],
    medications: ['eflornithine', 'DFMO'],
    audience: 'self',
    researchStage: 'active',
  },
  {
    id: 'ec-immunomodulator-autoimmune-skin',
    title: 'Immunomodulator for Rare Autoimmune Skin Disease',
    url: 'https://everycure.org/portfolio/',
    source: 'EveryCure',
    blurb:
      'Every Cure has identified sufficient clinical evidence supporting the repurposing of an immunomodulator for a rare autoimmune skin disease.',
    conditions: ['autoimmune skin disease'],
    symptomTags: ['skin', 'rash', 'autoimmune'],
    medications: [],
    audience: 'self',
    researchStage: 'active',
  },
  {
    id: 'ec-lidocaine-breast-cancer',
    title: 'Lidocaine for Breast Cancer',
    url: 'https://everycure.org/portfolio/',
    source: 'EveryCure',
    blurb:
      'Every Cure has identified clinical evidence supporting the investigation of lidocaine as a repurposed treatment for breast cancer.',
    conditions: ['breast cancer'],
    symptomTags: ['cancer'],
    medications: ['lidocaine'],
    audience: 'self',
    researchStage: 'active',
  },
  {
    id: 'ec-botox-depression',
    title: 'Glabellar Botox Injection for Major Depressive Disorder',
    url: 'https://everycure.org/portfolio/',
    source: 'EveryCure',
    blurb:
      'Every Cure has identified clinical evidence supporting glabellar injection of botulinum toxin (Botox) as a potential treatment for major depressive disorder.',
    conditions: ['major depressive disorder', 'depression'],
    symptomTags: ['depression', 'mood', 'sadness'],
    medications: ['botulinum toxin', 'botox'],
    audience: 'self',
    researchStage: 'active',
  },
  {
    id: 'ec-lenalidomide-histiocytosis',
    title: 'Lenalidomide for Rare Histiocytosis',
    url: 'https://everycure.org/portfolio/',
    source: 'EveryCure',
    blurb:
      'Every Cure has identified sufficient clinical evidence supporting the repurposing of lenalidomide for a rare histiocytosis condition.',
    conditions: ['histiocytosis'],
    symptomTags: [],
    medications: ['lenalidomide'],
    audience: 'self',
    researchStage: 'active',
  },
];

export default EVERYCURE_PROGRAMS;
