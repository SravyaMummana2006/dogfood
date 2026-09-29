import { z } from 'zod';

describe('Configuration Security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fails fast in production if SIGNING_ENCRYPTION_KEY is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SIGNING_ENCRYPTION_KEY;
    process.env.DATABASE_URL = 'postgres://fake';
    process.env.SESSION_SECRET = 'fakelongsecretkey12345678901234567';

    expect(() => {
      require('../src/config');
    }).toThrow(/SIGNING_ENCRYPTION_KEY is required in production|SIGNING_ENCRYPTION_KEY must be exactly 32 bytes/i);
  });

  it('rejects invalid-length SIGNING_ENCRYPTION_KEY in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.SIGNING_ENCRYPTION_KEY = 'too-short';
    process.env.DATABASE_URL = 'postgres://fake';
    process.env.SESSION_SECRET = 'fakelongsecretkey12345678901234567';

    expect(() => {
      require('../src/config');
    }).toThrow(/SIGNING_ENCRYPTION_KEY must be exactly 32 bytes/i);
  });

  it('accepts valid 32-byte SIGNING_ENCRYPTION_KEY in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.SIGNING_ENCRYPTION_KEY = '12345678901234567890123456789012';
    process.env.DATABASE_URL = 'postgres://fake';
    process.env.SESSION_SECRET = 'fakelongsecretkey12345678901234567';

    const { config } = require('../src/config');
    expect(config.SIGNING_ENCRYPTION_KEY).toBe('12345678901234567890123456789012');
  });

  it('uses default SIGNING_ENCRYPTION_KEY in development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SIGNING_ENCRYPTION_KEY;
    process.env.DATABASE_URL = 'postgres://fake';
    process.env.SESSION_SECRET = 'fakelongsecretkey12345678901234567';

    const { config } = require('../src/config');
    expect(config.SIGNING_ENCRYPTION_KEY).toBe('0123456789abcdef0123456789abcdef');
  });
});
