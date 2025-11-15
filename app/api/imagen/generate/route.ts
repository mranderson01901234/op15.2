import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, PersonGeneration } from "@google/genai";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";

const requestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  numberOfImages: z.number().min(1).max(4).optional().default(1),
  aspectRatio: z.enum(["1:1", "9:16", "16:9", "4:3", "3:4"]).optional().default("1:1"),
  imageSize: z.enum(["1K", "2K"]).optional().default("1K"),
  outputMimeType: z.enum(["image/jpeg", "image/png"]).optional().default("image/jpeg"),
});

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const { userId: authenticatedUserId } = await auth();
    if (!authenticatedUserId) {
      logger.warn("Imagen API: Unauthorized request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { prompt, numberOfImages, aspectRatio, imageSize, outputMimeType } =
      requestSchema.parse(body);

    logger.info("Imagen API request", { 
      userId: authenticatedUserId,
      prompt: prompt.substring(0, 50),
      numberOfImages,
      aspectRatio,
      imageSize 
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.error("Imagen API: GEMINI_API_KEY not configured");
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    logger.info("Calling Google Imagen API", { model: "imagen-4.0-generate-001" });
    
    const response = await ai.models.generateImages({
      model: "models/imagen-4.0-generate-001",
      prompt,
      config: {
        numberOfImages,
        outputMimeType,
        personGeneration: PersonGeneration.ALLOW_ALL,
        aspectRatio,
        imageSize,
      },
    });

    logger.info("Imagen API response received", { 
      hasResponse: !!response,
      hasGeneratedImages: !!response?.generatedImages,
      imageCount: response?.generatedImages?.length || 0
    });

    if (!response?.generatedImages) {
      logger.error("Imagen API: No images in response", new Error("No images in response"), { response });
      return NextResponse.json(
        { error: "No images generated" },
        { status: 500 }
      );
    }

    // Convert images to base64 data URLs
    const images = response.generatedImages
      .filter((img) => img?.image?.imageBytes)
      .map((img) => {
        const base64 = img.image?.imageBytes || "";
        const mimeType = outputMimeType || "image/jpeg";
        return {
          dataUrl: `data:${mimeType};base64,${base64}`,
          mimeType,
        };
      });

    logger.info("Imagen API: Successfully generated images", { 
      imageCount: images.length,
      hasDataUrls: images.every(img => !!img.dataUrl)
    });

    return NextResponse.json({ images });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Imagen API error", error instanceof Error ? error : undefined, {
      errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: "Failed to generate image",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

