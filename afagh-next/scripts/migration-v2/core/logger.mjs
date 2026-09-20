/**
 * ══════════════════════════════════════════════════════════════════════
 *  Migration V2: Logger
 * ══════════════════════════════════════════════════════════════════════
 */
function timestamp() {
  return new Date().toISOString();
}

export function info(message, meta = {}) {
  console.log(
    JSON.stringify({
      level: 'info',
      timestamp: timestamp(),
      message,
      ...meta,
    })
  );
}

export function warn(message, meta = {}) {
  console.warn(
    JSON.stringify({
      level: 'warn',
      timestamp: timestamp(),
      message,
      ...meta,
    })
  );
}

export function error(message, meta = {}) {
  console.error(
    JSON.stringify({
      level: 'error',
      timestamp: timestamp(),
      message,
      ...meta,
    })
  );
}

export function migrationEvent(event, meta = {}) {
  console.log(
    JSON.stringify({
      type: 'migration-v2',
      event,
      timestamp: timestamp(),
      ...meta,
    })
  );
}
