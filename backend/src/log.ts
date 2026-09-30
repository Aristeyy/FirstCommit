type Level = 'info' | 'warn' | 'error';

const role = process.argv[2] ?? 'app';

function write(level: Level, msg: string, extra?: unknown) {
  const rec: Record<string, unknown> = { t: new Date().toISOString(), level, role, msg };
  if (extra instanceof Error) rec.err = { message: extra.message, stack: extra.stack };
  else if (extra !== undefined) rec.data = extra;
  const line = JSON.stringify(rec);
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const log = {
  info: (m: string, e?: unknown) => write('info', m, e),
  warn: (m: string, e?: unknown) => write('warn', m, e),
  error: (m: string, e?: unknown) => write('error', m, e),
};
