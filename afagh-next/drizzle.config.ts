import type { Config } from 'drizzle-kit';

export default {
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL || 'postgres://afagh:afagh@localhost:5432/afagh_db' },
} satisfies Config;
