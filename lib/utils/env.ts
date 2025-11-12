import { z } from "zod";

const envSchema = z.object({
  GEMINI_API_KEY: z.string().optional(),
  WORKSPACE_ROOT: z.string().optional(),
  BRAVE_API_KEY: z.string().optional(),
});

const chatEnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  WORKSPACE_ROOT: z.string().optional(),
  BRAVE_API_KEY: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;
type ChatEnv = z.infer<typeof chatEnvSchema>;

/**
 * Validate and get environment variables (GEMINI_API_KEY is optional)
 * Use this for filesystem operations and other non-chat features
 */
export function getEnv(): Env {
  const env = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    WORKSPACE_ROOT: process.env.WORKSPACE_ROOT,
    BRAVE_API_KEY: process.env.BRAVE_API_KEY,
  };

  try {
    return envSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.issues.map((e) => e.path.join(".")).join(", ");
      throw new Error(`Missing or invalid environment variables: ${missing}`);
    }
    throw error;
  }
}

/**
 * Validate and get environment variables for chat operations
 * Requires GEMINI_API_KEY to be set
 */
export function getChatEnv(): ChatEnv {
  const env = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    WORKSPACE_ROOT: process.env.WORKSPACE_ROOT,
    BRAVE_API_KEY: process.env.BRAVE_API_KEY,
  };

  try {
    return chatEnvSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.issues.map((e) => e.path.join(".")).join(", ");
      throw new Error(`Missing or invalid environment variables: ${missing}`);
    }
    throw error;
  }
}

