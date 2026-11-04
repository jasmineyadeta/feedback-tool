import 'server-only';
import { z } from 'zod';

const Impl = z.enum(['local', 'mock']);

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  PROXY_ORIGIN: z.string().url().default('http://localhost:8787'),
  SUPABASE_URL: z.string().url().default('http://127.0.0.1:54321'),
  SUPABASE_ANON_KEY: z.string().min(1).default('missing'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default('missing'),
  MAILPIT_URL: z.string().url().default('http://127.0.0.1:54324'),
  PROXY_TOKEN_SECRET: z.string().min(16).default('dev-insecure-secret-change-me'),
  MOCK_AI: z.enum(['0', '1']).default('0'),
  TRANSCRIBER: Impl.default('mock'),
  ANCHOR_RESOLVER: Impl.default('mock'),
  SCREENSHOT: Impl.default('mock'),
  MAILER: Impl.default('mock'),
  PROXY_HOST: z.enum(['local']).default('local'),
  WHISPER_URL: z.string().url().default('http://127.0.0.1:8178'),
  OLLAMA_URL: z.string().url().default('http://127.0.0.1:11434'),
  ANCHOR_MODEL: z.string().default('qwen3:14b'),
  MAIL_OUTBOX_DIR: z.string().optional(),
  /** Shown on /contact for takedown requests. Unset = the page says no address is set up yet. */
  CONTACT_EMAIL: z.preprocess((v) => v || undefined, z.string().email().optional()),
});
export type ServerEnv = z.infer<typeof Env>;

let cached: ServerEnv | null = null;
export function env(): ServerEnv {
  if (!cached) cached = Env.parse(process.env);
  return cached;
}
/** Tests only. */
export function resetEnvCache() {
  cached = null;
}

/** MOCK_AI=1 forces mock transcriber and resolver regardless of other settings. */
export function aiImpl(kind: 'TRANSCRIBER' | 'ANCHOR_RESOLVER'): 'local' | 'mock' {
  const e = env();
  return e.MOCK_AI === '1' ? 'mock' : e[kind];
}
