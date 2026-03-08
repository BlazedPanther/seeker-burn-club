import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema.js';

const queryClient = postgres(env.DATABASE_URL, {
  max: env.DB_POOL_MAX,
  idle_timeout: 30,         // close idle connections after 30s
  connect_timeout: 10,      // fail connection attempt after 10s
  max_lifetime: 60 * 30,    // recycle connections every 30 min
});
export const db = drizzle(queryClient, { schema });
export type DB = typeof db;

/** Close the database connection pool (for graceful shutdown). */
export async function closeDb(): Promise<void> {
  await queryClient.end();
}
