import pino from 'pino';
import { config } from './config';

function hasPinoPretty(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

const usePretty = config.NODE_ENV === 'development' && hasPinoPretty();

export const logger = pino({
  level: config.LOG_LEVEL,
  ...(usePretty
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'password_hash', 'token'],
    censor: '[REDACTED]',
  },
});
