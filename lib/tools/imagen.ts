import type { UserContext } from "@/lib/types/user-context";
import { logger } from "@/lib/utils/logger";
import { GoogleGenAI, PersonGeneration } from "@google/genai";

export async function handleImagenGenerate(
  args: {
    prompt: string;
    numberOfImages?: number;
    aspectRatio?: "1:1" | "9:16" | "16:9" | "4:3" | "3:4";
    imageSize?: "1K" | "2K";
    outputMimeType?: "image/jpeg" | "image/png";
  },
  context: UserContext
): Promise<unknown> {
  logger.info("Generating image with Imagen4", {
    prompt: args.prompt.substring(0, 100),
    userId: context.userId,
  });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    const response = await ai.models.generateImages({
      model: "models/imagen-4.0-generate-001",
      prompt: args.prompt,
      config: {
        numberOfImages: args.numberOfImages || 1,
        outputMimeType: args.outputMimeType || "image/jpeg",
        personGeneration: PersonGeneration.ALLOW_ALL,
        aspectRatio: (args.aspectRatio || "1:1") as "1:1" | "9:16" | "16:9" | "4:3" | "3:4",
        imageSize: (args.imageSize || "1K") as "1K" | "2K",
      },
    });

    if (!response?.generatedImages) {
      throw new Error("No images generated");
    }

    // Convert images to base64 data URLs
    const images = response.generatedImages
      .filter((img) => img?.image?.imageBytes)
      .map((img) => {
        const base64 = img.image?.imageBytes || "";
        const mimeType = args.outputMimeType || "image/jpeg";
        return {
          dataUrl: `data:${mimeType};base64,${base64}`,
          mimeType,
        };
      });

    // Return result with special marker to indicate image should be displayed
    return {
      success: true,
      message: `Generated ${images.length} image(s)`,
      images,
      _imageGenerated: true, // Special marker for chat route
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Imagen4 generation failed", error instanceof Error ? error : undefined, {
      error: errorMessage,
      userId: context.userId,
    });
    throw error;
  }
}

