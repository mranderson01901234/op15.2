/**
 * User context for tool execution
 * Currently hardcoded, but structured for easy auth integration later
 */
export interface UserContext {
  userId: string;
  workspaceId?: string;
  browserBridgeConnected?: boolean;
  workspacePath?: string; // For exec.run operations
}

/**
 * Get default user context (hardcoded for now)
 * Later: Extract from auth token (Clerk/Auth0)
 */
export function getDefaultUserContext(): UserContext {
  return {
    userId: "local",
    workspaceId: undefined,
    browserBridgeConnected: false,
  };
}

/**
 * Get user context from Clerk authentication
 */
export async function getUserContext(): Promise<UserContext> {
  // This will be implemented when we integrate Clerk auth
  // For now, return default
  return getDefaultUserContext();
}

