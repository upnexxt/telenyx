import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Supabase
  SUPABASE_URL: z.string().url().default('https://ollrwbogmvmydgrmcnhn.supabase.co'),
  SUPABASE_ANON_KEY: z.string().min(1).default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default(''),

  // Gemini AI
  GEMINI_API_KEY: z.string().min(1).default(''),
  VITE_GEMINI_API_KEY: z.string().min(1).default(''),

  // Telnyx
  TELNYX_API_KEY: z.string().min(1).default(''),
  TELNYX_PUBLIC_KEY: z.string().min(1).default(''),
  TELNYX_SIP_USERNAME: z.string().min(1).default(''),
  TELNYX_SIP_PASSWORD: z.string().min(1).default(''),

  // Stripe
  STRIPE_PUBLISHABLE_KEY: z.string().min(1).default(''),
  STRIPE_SECRET_KEY: z.string().min(1).default(''),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).default(''),
  STRIPE_MINUTE_PACK_PRICE_ID: z.string().min(1).default(''),
  STRIPE_SUBSCRIPTION_PRICE_ID: z.string().min(1).default(''),

  // Resend
  RESEND_API_KEY: z.string().min(1).default(''),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

let config: Config;

try {
  config = configSchema.parse(process.env);
} catch (error) {
  console.error('Configuration validation failed:', error);
  process.exit(1);
}

export { config };