import type { Pool } from 'pg';
import { createLogger } from '@/lib/logger';

const globalPools = globalThis as unknown as { __afaghObservedPools?: WeakSet<Pool> };
const observed = globalPools.__afaghObservedPools ??= new WeakSet<Pool>();

/** pg can emit a second Client error after a connection drops during a query.
 * Query promises still reject; observing the EventEmitter error prevents an
 * unrelated process crash. Never include SQL parameters or credentials here. */
const log = createLogger({ mod: 'db' });

export function observePoolErrors(pool: Pool): void {
  if (observed.has(pool)) return;
  observed.add(pool);
  const report = (error: Error & { code?: string }) => log.error('db_connection_failure', { code: error.code ?? 'CONNECTION_LOST' });
  pool.on('error', report);
  pool.on('connect', client => client.on('error', report));
}
