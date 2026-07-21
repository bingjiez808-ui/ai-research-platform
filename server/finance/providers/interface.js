export class DataProvider {
  constructor(id) { this.id = id; }
  isConfigured() { return true; }
  async health() { return { provider: this.id, configured: this.isConfigured(), healthy: true }; }
  unsupported(capability) { throw Object.assign(new Error(`${this.id} does not support ${capability}`), { code: 'PROVIDER_CAPABILITY_UNSUPPORTED', status: 501, provider: this.id }); }
  stockBasic(_params) { return this.unsupported('stockBasic'); }
  dailyQuotes(_params) { return this.unsupported('dailyQuotes'); }
  indexQuotes(_params) { return this.unsupported('indexQuotes'); }
  financialIndicators(_params) { return this.unsupported('financialIndicators'); }
  topList(_params) { return this.unsupported('topList'); }
}

export function requireConfigured(provider) {
  if (!provider.isConfigured()) throw Object.assign(new Error(`${provider.id} is not configured`), { code: 'PROVIDER_NOT_CONFIGURED', status: 503, provider: provider.id });
  return provider;
}
