// openFDA API service — drug labels, adverse events, recalls
// https://open.fda.gov/apis/

const FDA_BASE = 'https://api.fda.gov/drug';
const TIMEOUT_MS = 15000;

async function fdaFetch(endpoint, params) {
  const url = `${FDA_BASE}/${endpoint}?${new URLSearchParams(params).toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return { results: [] };
    if (!res.ok) throw new Error(`FDA API error: ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildDrugSearch(drugName) {
  const encoded = encodeURIComponent(drugName);
  return `(openfda.brand_name:"${encoded}"+openfda.generic_name:"${encoded}")`;
}

export async function searchDrugLabel(drugName) {
  try {
    const data = await fdaFetch('label.json', {
      search: buildDrugSearch(drugName),
      limit: 3,
    });
    if (!data.results?.length) return [];
    return data.results.map(r => ({
      brand_name: r.openfda?.brand_name?.[0] || drugName,
      generic_name: r.openfda?.generic_name?.[0] || '',
      manufacturer: r.openfda?.manufacturer_name?.[0] || '',
      description: r.description?.[0] || '',
      indications: r.indications_and_usage?.[0] || '',
      warnings: r.warnings?.[0] || r.boxed_warning?.[0] || '',
      dosage: r.dosage_and_administration?.[0] || '',
      adverse_reactions: r.adverse_reactions?.[0] || '',
      contraindications: r.contraindications?.[0] || '',
      drug_interactions: r.drug_interactions?.[0] || '',
    }));
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  }
}

export async function searchRecalls(drugName) {
  try {
    const encoded = encodeURIComponent(drugName);
    const data = await fdaFetch('enforcement.json', {
      search: `product_description:"${encoded}"`,
      limit: 5,
      sort: 'report_date:desc',
    });
    if (!data.results?.length) return [];
    return data.results.map(r => ({
      recall_number: r.recall_number || '',
      reason: r.reason_for_recall || '',
      status: r.status || '',
      classification: r.classification || '',
      date: r.report_date || '',
      product: r.product_description || '',
      firm: r.recalling_firm || '',
    }));
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  }
}

export async function searchAdverseEvents(drugName) {
  try {
    const encoded = encodeURIComponent(drugName);
    const data = await fdaFetch('event.json', {
      search: `patient.drug.openfda.brand_name:"${encoded}"`,
      limit: 10,
    });
    if (!data.results?.length) return [];

    // Aggregate reactions across reports
    const reactionCounts = {};
    let seriousCount = 0;
    for (const event of data.results) {
      if (event.serious) seriousCount++;
      for (const reaction of event.patient?.reaction || []) {
        const name = reaction.reactionmeddrapt;
        if (name) reactionCounts[name] = (reactionCounts[name] || 0) + 1;
      }
    }

    const topReactions = Object.entries(reactionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count }));

    return {
      total_reports: data.meta?.results?.total || data.results.length,
      serious_count: seriousCount,
      sample_size: data.results.length,
      top_reactions: topReactions,
    };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  }
}
