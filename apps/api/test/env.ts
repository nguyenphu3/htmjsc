export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://htm_app:htm_app_dev@localhost:5432/htm_test';
export const TEST_MIGRATION_URL =
  process.env.TEST_MIGRATION_DATABASE_URL ?? 'postgres://htm:htm_dev@localhost:5432/htm_test';
export const SEED_PASSWORD = 'Test-Password-123';
