import { NextResponse } from "next/server";

/**
 * Get the root path for the file tree
 * Returns WORKSPACE_ROOT if set, otherwise filesystem root "/"
 */
export async function GET() {
  try {
    // Get WORKSPACE_ROOT directly without requiring GEMINI_API_KEY
    // Defaults to "/" (filesystem root) instead of process.cwd() to work with any directory
    const rootPath = process.env.WORKSPACE_ROOT || "/";
    
    return NextResponse.json({ rootPath });
  } catch (error) {
    console.error("Failed to get root path:", error);
    return NextResponse.json(
      { 
        error: "Failed to get root path",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

