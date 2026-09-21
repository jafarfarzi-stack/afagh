import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://afagh:afagh@localhost:5432/afagh_db',
});

async function main() {
  const domains = await pool.query(`
    SELECT domain, count(*), array_agg(DISTINCT "legacyTitle") filter (where "legacyTitle" is not null) as sample_titles
    FROM legacy_code_maps
    GROUP BY domain
    ORDER BY domain
  `);
  console.table(domains.rows.map(r => ({
    domain: r.domain,
    count: r.count,
    sample: (r.sample_titles || []).slice(0, 3).join(', ')
  })));

  await pool.end();
}

main().catch(console.error);
