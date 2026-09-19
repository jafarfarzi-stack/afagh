import type { Pool } from 'pg';

const globalPools = globalThis as unknown as { __afaghObservedPools?: WeakSet<Pool> };
const observed = globalPools.__afaghObservedPools ??= new WeakSet<Pool>();

/** pg can emit a second Client error after a connection drops during a query.
 * Query promises still reject; observing the EventEmitter error prevents an
 * unrelated process crash. Never include SQL parameters or credentials here. */
export function observePoolErrors(pool: Pool): void {
  if (observed.has(pool)) return;
  observed.add(pool);
  const report = (error: Error & { code?: string }) => console.error('[db] connection failure', { code: error.code ?? 'CONNECTION_LOST' });
  pool.on('error', report);
  pool.on('connect', client => client.on('error', report));
}
