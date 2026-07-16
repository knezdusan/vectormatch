import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const patterns = [
    { name: 'security clearance', re: '(security clearance|top secret|ts/sci|secret clearance|clearance required|active clearance)' },
    { name: 'us citizen', re: '(us citizen|u\\.s\\. citizen|us citizenship|must be a us citizen)' },
    { name: 'itar/dod/defense', re: '(itar|ear|export control|dod|department of defense|defense contract)' },
    { name: 'natsec/homeland', re: '(national security|homeland security|intelligence community)' },
    { name: 'e-verify/polygraph', re: '(e-verify|everify|public trust|polygraph|counterintelligence)' },
  ];

  for (const p of patterns) {
    const count = await sql`
      SELECT count(*) as cnt
      FROM job
      WHERE status = 'active'
      AND remote_scope = 'global'
      AND job_embedding IS NOT NULL
      AND COALESCE(normalized_text, '') ~* ${p.re}
    `;
    console.log(`text ${p.name}: ${count[0].cnt}`);
  }

  console.log('\n=== TITLE PATTERNS ===');
  for (const p of patterns) {
    const count = await sql`
      SELECT count(*) as cnt
      FROM job
      WHERE status = 'active'
      AND remote_scope = 'global'
      AND job_embedding IS NOT NULL
      AND title ~* ${p.re}
    `;
    console.log(`title ${p.name}: ${count[0].cnt}`);
  }
}

main().catch(console.error);
