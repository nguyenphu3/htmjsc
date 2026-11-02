import pg from 'pg';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { SEED_PASSWORD, TEST_MIGRATION_URL } from './env.js';

export default async function setup() {
  const client = new pg.Client({ connectionString: TEST_MIGRATION_URL });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();
  await migrate(TEST_MIGRATION_URL, () => undefined);
  await seed(TEST_MIGRATION_URL, SEED_PASSWORD, true, () => undefined);
}
