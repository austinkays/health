const cache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

export async function getHealthTopicInfo(conditionName) {
  if (!conditionName) return null;

  const key = `ml:${conditionName.toLowerCase()}`;
  const cached = getCached(key);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(
      `https://connect.medlineplus.gov/service?mainSearchCriteria.v.dn=${encodeURIComponent(conditionName)}&informationRecipient.languageCode.c=en&knowledgeResponseType=application/json`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const entries = data?.feed?.entry;
    if (!entries || entries.length === 0) return null;

    const entry = entries[0];
    const result = {
      title: entry.title?._value || conditionName,
      summary: entry.summary?._value?.replace(/<[^>]*>/g, '').slice(0, 300) || '',
      url: entry.link?.[0]?.href || '',
    };

    cache.set(key, { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}
