import { z } from 'zod';
import { type LocalTool } from '../types';

const BASE_URL = '/api/v1/tools/exa';

interface ExaResult {
  id: string;
  url: string;
  title: string;
  author?: string;
  publishedDate?: string;
  score?: number;
  text?: string;
  summary?: string;
  highlights?: string[];
  image?: string;
  favicon?: string;
}

interface ExaSearchResponse {
  requestId: string;
  results: ExaResult[];
  searchType?: string;
}

interface ExaFindSimilarResponse {
  requestId: string;
  results: ExaResult[];
}

interface ExaGetContentsResponse {
  requestId: string;
  results: ExaResult[];
}

interface ExaToolResponse {
  success: boolean;
  data?: ExaSearchResponse | ExaFindSimilarResponse | ExaGetContentsResponse;
  error?: string;
}

export const exaTool: LocalTool = {
  name: 'exa_search',
  description: 'Search the web using Exa AI. IMPORTANT: For comprehensive research, use this tool MULTIPLE TIMES in sequence: 1. First call with "search" to find relevant URLs. 2. Then call again with "get_contents" using the URLs from step 1 to get full article text. 3. Optionally use "find_similar" to discover related content. This multi-step approach provides complete information instead of truncated snippets.',
  parameters: z.object({
    action: z.enum(['search', 'find_similar', 'get_contents']).optional().describe('Action to perform (auto-detected if not specified). search: Search the web with a query. find_similar: Find pages similar to a given URL. get_contents: Get full content from specific URLs.'),
    query: z.string().optional().describe('Search query for "search" action (e.g., "latest AI research papers").'),
    url: z.string().optional().describe('URL for "find_similar" action.'),
    urls: z.array(z.string()).optional().describe('Array of URLs for "get_contents" action.'),
    type: z.enum(['neural', 'fast', 'auto', 'deep']).optional().describe('Search type: neural (embeddings-based), fast (streamlined), auto (intelligent combination), deep (comprehensive with query expansion).'),
    category: z.enum(['company', 'research paper', 'news', 'pdf', 'github', 'tweet', 'personal site', 'people', 'financial report']).optional().describe('Filter results by category.'),
    numResults: z.number().min(1).max(100).optional().describe('Number of results to return (default: 10, max: 100).'),
    includeDomains: z.array(z.string()).optional().describe('Only include results from these domains.'),
    excludeDomains: z.array(z.string()).optional().describe('Exclude results from these domains.'),
    includeText: z.array(z.string()).optional().describe('Results must contain these text strings.'),
    excludeText: z.array(z.string()).optional().describe('Results must not contain these text strings.'),
    getText: z.boolean().optional().describe('Include full text content in results (default: true). Set to false to exclude text.'),
    getSummary: z.boolean().optional().describe('Include AI-generated summary in results.'),
  }),
  execute: async ({ action, query, url, urls, type, category, numResults, includeDomains, excludeDomains, includeText, excludeText, getText, getSummary }) => {
    try {
      // Auto-detect action if not provided
      if (!action) {
        if (query) {
          action = 'search';
        } else if (url) {
          action = 'find_similar';
        } else if (urls && urls.length > 0) {
          action = 'get_contents';
        } else {
          throw new Error('Unable to determine action. Please provide either query, url, or urls parameter.');
        }
      }

      const params: Record<string, any> = {};

      if (action === 'search') {
        if (!query) throw new Error('Query is required for search action');
        params.query = query;
        if (type) params.type = type;
        if (category) params.category = category;
        if (numResults) params.numResults = numResults;
        if (includeDomains) params.includeDomains = includeDomains;
        if (excludeDomains) params.excludeDomains = excludeDomains;
        if (includeText) params.includeText = includeText;
        if (excludeText) params.excludeText = excludeText;

        // Always include text content by default (can be disabled by setting getText to false)
        params.contents = {};
        // Default to including text unless explicitly set to false
        if (getText !== false) {
          params.contents.text = true;
        }
        if (getSummary) {
          params.contents.summary = true;
        }
      }

      if (action === 'find_similar') {
        if (!url) throw new Error('URL is required for find_similar action');
        params.url = url;
        if (numResults) params.numResults = numResults;

        // Always include text content by default
        params.contents = {};
        if (getText !== false) {
          params.contents.text = true;
        }
        if (getSummary) {
          params.contents.summary = true;
        }
      }

      if (action === 'get_contents') {
        if (!urls || urls.length === 0) throw new Error('URLs array is required for get_contents action');
        params.urls = urls;
        // Default to including text unless explicitly set to false
        params.text = getText !== false;
        if (getSummary) {
          params.summary = {};
        }
      }

      const response = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          params,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json() as ExaToolResponse;

      if (!result.success) {
        throw new Error(result.error || 'Unknown error from Exa API');
      }

      // Format results for better readability
      if (result.data && 'results' in result.data) {
        const formattedResults = result.data.results.map((r: ExaResult) => ({
          title: r.title,
          url: r.url,
          author: r.author,
          publishedDate: r.publishedDate,
          score: r.score,
          summary: r.summary,
          text: r.text, // Return full text without truncation
          highlights: r.highlights,
        }));

        return {
          requestId: result.data.requestId,
          searchType: 'searchType' in result.data ? result.data.searchType : undefined,
          count: formattedResults.length,
          results: formattedResults,
        };
      }

      return result.data;

    } catch (error) {
      throw new Error(`Exa Tool Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
