import { AkShareProvider } from './akshare.js';
import { SinaProvider } from './sina.js';
import { TushareProvider } from './tushare.js';

export const providers = new Map([
  ['tushare', new TushareProvider()],
  ['akshare', new AkShareProvider()],
  ['sina', new SinaProvider()],
]);
export const getProvider = id => providers.get(id) || null;
export const providerHealth = () => Promise.all([...providers.values()].map(provider => provider.health()));
