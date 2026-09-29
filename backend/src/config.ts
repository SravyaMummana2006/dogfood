import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
  SESSION_SECRET: z.string().min(16),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(24),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  SIGNING_ENCRYPTION_KEY: process.env.NODE_ENV === 'production' 
    ? z.string({ required_error: 'SIGNING_ENCRYPTION_KEY is required in production' }).length(32, 'SIGNING_ENCRYPTION_KEY must be exactly 32 bytes')
    : z.string().length(32).default('0123456789abcdef0123456789abcdef'),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema.parse(process.env);
