const REDACTED_KEYS = new Set([
  'phone',
  'name',
  'pushName',
  'message',
  'messages',
  'content',
  'text',
  'remoteJid',
  'chatid',
]);

type LogMeta = Record<string, unknown>;

function redact(meta: LogMeta): LogMeta {
  const clean: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    clean[key] = REDACTED_KEYS.has(key) ? '[redacted]' : value;
  }
  return clean;
}

function write(level: 'info' | 'warn' | 'error' | 'debug', msg: string, meta?: LogMeta) {
  const entry = {
    level,
    time: new Date().toISOString(),
    msg,
    ...(meta ? redact(meta) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, meta?: LogMeta) => write('info', msg, meta),
  warn: (msg: string, meta?: LogMeta) => write('warn', msg, meta),
  error: (msg: string, meta?: LogMeta) => write('error', msg, meta),
  debug: (msg: string, meta?: LogMeta) => {
    if (process.env.NODE_ENV !== 'production') write('debug', msg, meta);
  },
};
