import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, PersonGeneration } from "@google/genai";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { prompt, numberOfImages, aspectRatio, imageSize, outputMimeType } =
      requestSchema.parse(body);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

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

    if (!response?.generatedImages) {
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

    return NextResponse.json({ images });
  } catch (error) {
    console.error("Imagen4 generation error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate image",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

