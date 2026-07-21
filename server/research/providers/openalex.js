import { request } from './http.js';

export async function fetchOpenAlex({ query = 'artificial intelligence', limit = 50, cursor = '*' } = {}) {
  if (!process.env.OPENALEX_API_KEY) {
    throw Object.assign(new Error('OPENALEX_API_KEY is required. Create a free key at openalex.org/settings/api.'), { status: 503, code: 'OPENALEX_KEY_REQUIRED', provider: 'openalex' });
  }
  const params = new URLSearchParams({
    search: query,
    'per-page': String(Math.min(limit, 100)),
    cursor,
    api_key: process.env.OPENALEX_API_KEY,
  });
  if (process.env.OPENALEX_EMAIL) params.set('mailto', process.env.OPENALEX_EMAIL);
  const { data } = await request('openalex', `https://api.openalex.org/works?${params}`);
  return {
    nextCursor: data.meta?.next_cursor,
    items: data.results.map(p => ({
      provider: 'openalex', providerId: p.id.split('/').pop(), sourceUrl: p.id,
      title: p.title, abstract: null, publicationDate: p.publication_date,
      venue: p.primary_location?.source?.display_name,
      doi: p.doi?.replace('https://doi.org/', ''), citationCount: p.cited_by_count,
      authors: (p.authorships || []).map(a => ({ providerId: a.author.id.split('/').pop(), name: a.author.display_name, affiliations: a.institutions.map(i => i.display_name) })),
      topics: (p.topics || p.concepts || []).map(t => ({ providerId: t.id?.split('/').pop(), name: t.display_name, score: t.score })),
      raw: p,
    })),
  };
}
