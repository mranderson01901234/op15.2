/**
 * Detects if a user message is requesting image generation
 * Returns the prompt if detected, null otherwise
 */

const IMAGE_GENERATION_PATTERNS = [
  /generate\s+(an\s+)?image\s+of\s+(.+)/i,
  /create\s+(an\s+)?image\s+of\s+(.+)/i,
  /make\s+(an\s+)?image\s+of\s+(.+)/i,
  /draw\s+(an\s+)?image\s+of\s+(.+)/i,
  /show\s+me\s+(an\s+)?image\s+of\s+(.+)/i,
  /I\s+want\s+(an\s+)?image\s+of\s+(.+)/i,
  /can\s+you\s+generate\s+(an\s+)?image\s+of\s+(.+)/i,
  /generate\s+a\s+picture\s+of\s+(.+)/i,
  /create\s+a\s+picture\s+of\s+(.+)/i,
  /make\s+a\s+picture\s+of\s+(.+)/i,
  /draw\s+a\s+picture\s+of\s+(.+)/i,
  /show\s+me\s+a\s+picture\s+of\s+(.+)/i,
  /I\s+want\s+a\s+picture\s+of\s+(.+)/i,
  /generate\s+(.+)\s+image/i,
  /create\s+(.+)\s+image/i,
  /make\s+(.+)\s+image/i,
  /draw\s+(.+)\s+image/i,
  /generate\s+(.+)/i, // Fallback: if message starts with "generate" and is short, likely image generation
];

/**
 * Detects if a message is requesting image generation
 * @param message - User's message
 * @returns The image prompt if detected, null otherwise
 */
export function detectImageGenerationRequest(message: string): string | null {
  const trimmedMessage = message.trim();
  
  // Check each pattern
  for (const pattern of IMAGE_GENERATION_PATTERNS) {
    const match = trimmedMessage.match(pattern);
    if (match) {
      // Extract the prompt (usually the last capture group)
      const prompt = match[match.length - 1]?.trim();
      if (prompt && prompt.length > 3) {
        // Additional validation: if message is very short and starts with "generate",
        // it's likely an image generation request
        if (pattern.source.includes('generate') && trimmedMessage.length < 100) {
          return prompt;
        }
        // For other patterns, return the extracted prompt
        if (match.length > 1) {
          return prompt;
        }
      }
    }
  }
  
  // Special case: very short messages starting with "generate" are likely image requests
  if (trimmedMessage.toLowerCase().startsWith('generate ') && trimmedMessage.length < 150) {
    const rest = trimmedMessage.substring(9).trim();
    if (rest.length > 3) {
      return rest;
    }
  }
  
  return null;
}

