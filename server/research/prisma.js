import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

function createClient() {
  if (!process.env.DATABASE_URL) {
    throw Object.assign(new Error('DATABASE_URL is required'), {
      status: 503,
      code: 'DATABASE_NOT_CONFIGURED',
    });
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export function getPrisma() {
  if (!globalForPrisma.__researchPrisma) {
    globalForPrisma.__researchPrisma = createClient();
  }
  return globalForPrisma.__researchPrisma;
}
