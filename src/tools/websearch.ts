import { tool } from 'langchain';
import { z } from 'zod';
import * as cheerio from 'cheerio';

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGE_CHARS = 4_000;

const MEDIA_HOST_DENYLIST = [
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'dailymotion.com',
    'twitch.tv',
    'imgur.com',
    'flickr.com',
    'pinterest.',
    'instagram.com',
    'tiktok.com',
];

const MEDIA_EXTENSION_RE = /\.(jpe?g|png|gif|webp|svg|bmp|ico|mp4|mov|avi|webm|mkv|mp3|wav|ogg)(\?|#|$)/i;

type SearchResult = { title: string; url: string; description: string };
type PageFetchResult = { url: string; content: string } | { url: string; error: string };

function isMediaUrl(url: string): boolean {
    try {
        const { hostname, pathname } = new URL(url);
        if (MEDIA_HOST_DENYLIST.some((h) => hostname.includes(h))) return true;
        if (MEDIA_EXTENSION_RE.test(pathname)) return true;
        return false;
    } catch {
        return true; // unparseable — skip rather than risk passing it through
    }
}

// DuckDuckGo's HTML results wrap real URLs in a redirect link:
//duckduckgo.com/l/?uddg=<percent-encoded-target>&rut=...
function extractRealUrl(href: string): string | null {
    try {
        const u = new URL(href, 'https://duckduckgo.com');
        const uddg = u.searchParams.get('uddg');
        if (uddg) return decodeURIComponent(uddg);
        if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
        return null;
    } catch {
        return null;
    }
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`DuckDuckGo returned HTTP ${res.status}`);

    const $ = cheerio.load(await res.text());
    const results: SearchResult[] = [];

    $('.result').each((_: number, el: any) => {
        if (results.length >= limit) return false; // stop iterating early
        const node = $(el);
        if (node.hasClass('result--ad') || node.hasClass('result--sponsored')) return;

        const titleEl = node.find('.result__a').first();
        const href = titleEl.attr('href');
        const title = titleEl.text().trim();
        const description = node.find('.result__snippet').first().text().trim();
        if (!href || !title) return;

        const realUrl = extractRealUrl(href);
        if (!realUrl || isMediaUrl(realUrl)) return;

        results.push({ title, url: realUrl, description });
    });

    return results;
}

function htmlToReadableText($: cheerio.CheerioAPI): string {
    $('script, style, noscript, iframe, svg, nav, footer, header, form, button').remove();
    return $('body').text().replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

async function fetchPageContent(url: string): Promise<PageFetchResult> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            redirect: 'follow',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) return { url, error: `HTTP ${res.status}` };

        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
            return { url, error: `Unsupported content-type: ${contentType || 'unknown'}` };
        }

        const $ = cheerio.load(await res.text());
        let text = htmlToReadableText($);
        if (text.length > MAX_PAGE_CHARS) {
            text = `${text.slice(0, MAX_PAGE_CHARS)}\n…[truncated ${text.length - MAX_PAGE_CHARS} more characters]`;
        }
        return { url, content: text };
    } catch (error: any) {
        return { url, error: error.name === 'TimeoutError' ? 'Request timed out' : error.message ?? String(error) };
    }
}

const schema = z.object({
    query: z.string().describe('The search query.'),
    maxResults: z.number().min(1).max(5).optional().describe('How many results to fetch. Defaults to 3.'),
});

export const webSearch = tool(
    async ({ query, maxResults }) => {
        const limit = maxResults ?? 3;

        let results: SearchResult[];
        try {
            results = await searchDuckDuckGo(query, limit);
        } catch (error: any) {
            return `Search failed: ${error.message ?? String(error)}`;
        }

        if (results.length === 0) {
            return `No results found for "${query}".`;
        }

        const pages = await Promise.all(results.map((r) => fetchPageContent(r.url)));

        const sections = results.map((r, i) => {
            const page = pages[i];
            const body = 'content' in page ? page.content : `(could not fetch page: ${page.error})`;
            return [`### ${i + 1}. ${r.title}`, `URL: ${r.url}`, `Snippet: ${r.description}`, `Content:\n${body}`].join('\n');
        });

        return sections.join('\n\n---\n\n');
    },
    {
        name: 'web_search',
        description:
            'Search the web (via DuckDuckGo) and return the top results: title, URL, snippet, and fetched page text for each. Image and video links are filtered out. Use this for current information not in your training data.',
        schema,
    }
);