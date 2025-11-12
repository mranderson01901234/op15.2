import type { UserContext } from "@/lib/types/user-context";
import { getEnv } from "@/lib/utils/env";
import { logger } from "@/lib/utils/logger";

/**
 * Handle brave.search tool call
 * Perform web search using Brave Search API
 */
export async function handleBraveSearch(
  args: {
    query: string;
    count?: number;
    offset?: number;
    safesearch?: "off" | "moderate" | "strict";
    freshness?: "pd" | "pw" | "pm" | "py";
    country?: string;
    search_lang?: string;
    ui_lang?: string;
  },
  context: UserContext
) {
  const {
    query,
    count = 10,
    offset = 0,
    safesearch = "moderate",
    freshness,
    country,
    search_lang,
    ui_lang,
  } = args;

  const env = getEnv();
  
  if (!env.BRAVE_API_KEY) {
    throw new Error("BRAVE_API_KEY is not configured. Please set it in your environment variables.");
  }

  if (!query || query.trim().length === 0) {
    throw new Error("Search query cannot be empty");
  }

  try {
    // Build query parameters
    const params = new URLSearchParams({
      q: query,
      count: count.toString(),
      offset: offset.toString(),
      safesearch,
    });

    if (freshness) {
      params.append("freshness", freshness);
    }
    if (country) {
      params.append("country", country);
    }
    if (search_lang) {
      params.append("search_lang", search_lang);
    }
    if (ui_lang) {
      params.append("ui_lang", ui_lang);
    }

    const url = `https://api.search.brave.com/res/v1/web/search?${params.toString()}`;

    logger.info("Brave search request", {
      query,
      count,
      offset,
      userId: context.userId,
    });

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": env.BRAVE_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      const status = response.status;
      const statusText = response.statusText;
      logger.error("Brave API error", undefined, {
        status,
        statusText,
        error: errorText,
      });
      throw new Error(
        `Brave Search API error: ${response.status} ${response.statusText}. ${errorText}`
      );
    }

    const data = await response.json();

    // Extract images from the response (if available)
    const images = (data.images?.results || []).map((image: any) => ({
      thumbnail: image.thumbnail ? {
        src: image.thumbnail.src || "",
        original: image.thumbnail.original || null,
      } : null,
      url: image.url || "",
      title: image.title || "",
    })).filter((img: any) => img.thumbnail?.src); // Only include images with valid thumbnails

    // Extract videos from the response (if available)
    const videos = (data.videos?.results || []).map((video: any) => ({
      thumbnail: video.thumbnail ? {
        src: video.thumbnail.src || "",
        original: video.thumbnail.original || null,
      } : null,
      url: video.url || "",
      title: video.title || "",
      duration: video.duration || null,
      age: video.age || null,
    })).filter((vid: any) => vid.thumbnail?.src); // Only include videos with valid thumbnails

    // Extract discussions (forums/podcasts) - can be used for "Listen"
    const discussions = (data.discussions?.results || []).map((discussion: any) => ({
      title: discussion.title || "",
      url: discussion.url || "",
      description: discussion.description || "",
      age: discussion.age || null,
    }));

    // Extract FAQ items
    const faq = (data.faq?.results || []).map((item: any) => ({
      question: item.question || "",
      answer: item.answer || "",
    }));

    // Extract infobox data
    const infobox = data.infobox ? {
      title: data.infobox.title || "",
      description: data.infobox.description || "",
      url: data.infobox.url || null,
    } : null;

    // Extract web results with metadata
    const webResults = (data.web?.results || []).map((result: any) => ({
      title: result.title || "",
      url: result.url || "",
      description: result.description || "",
      age: result.age || null,
      thumbnail: result.thumbnail ? {
        src: result.thumbnail.src || "",
        original: result.thumbnail.original || null,
      } : null,
      meta_url: result.meta_url || {},
    }));

    // Extract news results
    const newsResults = (data.news?.results || []).map((result: any) => ({
      title: result.title || "",
      url: result.url || "",
      description: result.description || "",
      age: result.age || null,
      meta_url: result.meta_url || {},
      thumbnail: result.thumbnail ? {
        src: result.thumbnail.src || "",
        original: result.thumbnail.original || null,
      } : null,
    }));

    // Helper function to determine if a URL is a book retailer
    const isBookRetailer = (url: string): boolean => {
      const urlLower = url.toLowerCase();
      const bookRetailerDomains = [
        'audible.com',
        'audible.ca',
        'audible.co.uk',
        'amazon.com',
        'amazon.ca',
        'amazon.co.uk',
        'amazon.com.au',
        'barnesandnoble.com',
        'bn.com',
        'bookshop.org',
        'booksamillion.com',
        'indigo.ca',
        'chapters.indigo.ca',
        'goodreads.com',
        'kobo.com',
        'apple.com/books',
        'books.apple.com',
        'thriftbooks.com',
        'abebooks.com',
        'alibris.com',
        'betterworldbooks.com',
        'bookdepository.com',
        'bookfinder.com',
      ];
      return bookRetailerDomains.some(domain => urlLower.includes(domain));
    };

    // Format results for LLM consumption
    const results = {
      query: data.query?.original || query,
      totalResults: data.web?.total_results || 0,
      images: images.length > 0 ? images : undefined,
      videos: videos.length > 0 ? videos : undefined,
      discussions: discussions.length > 0 ? discussions : undefined,
      faq: faq.length > 0 ? faq : undefined,
      infobox: infobox || undefined,
      results: webResults,
      news: newsResults,
      // Include all sources with descriptions for display
      allSources: [
        ...webResults.map((r: { title: string; url: string; description: string }) => ({ 
          title: r.title, 
          url: r.url, 
          description: r.description, 
          type: isBookRetailer(r.url) ? 'book' : 'web' 
        })),
        ...newsResults.map((r: { title: string; url: string; description: string }) => ({ 
          title: r.title, 
          url: r.url, 
          description: r.description, 
          type: isBookRetailer(r.url) ? 'book' : 'news' 
        })),
        ...discussions.map((r: { title: string; url: string; description: string }) => ({ 
          title: r.title, 
          url: r.url, 
          description: r.description, 
          type: 'discussion' 
        })),
      ],
    };

    logger.info("Brave search completed", {
      query,
      resultCount: results.results.length,
      totalResults: results.totalResults,
      userId: context.userId,
    });

    return results;
  } catch (error) {
    logger.error("Brave search failed", error instanceof Error ? error : undefined);
    throw error;
  }
}

