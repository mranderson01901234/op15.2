import { z } from "zod";

const clerkEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1, "Clerk publishable key is required"),
  CLERK_SECRET_KEY: z.string().min(1, "Clerk secret key is required"),
});

type ClerkEnv = z.infer<typeof clerkEnvSchema>;

/**
 * Validate and get Clerk environment variables
 * Throws error if required variables are missing
 */
export function getClerkEnv(): ClerkEnv {
  const env = {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  };

  try {
    return clerkEnvSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.issues.map((e) => e.path.join(".")).join(", ");
      throw new Error(`Missing or invalid Clerk environment variables: ${missing}. Please check your .env.local file.`);
    }
    throw error;
  }
}

/**
 * Check if Clerk is configured (non-throwing)
 */
export function isClerkConfigured(): boolean {
  try {
    getClerkEnv();
    return true;
  } catch {
    return false;
  }
}

