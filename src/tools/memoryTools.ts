import { tool } from 'langchain';
import { z } from 'zod';
import { DEFAULT_CONTAINER_TAG } from '../lib/supermemory';

const SUPERMEMORY_BASE_URL = 'http://localhost:8787';

// ─── Helper: fetch with error handling ──────────────────
async function supermemoryFetch(endpoint: string, options: RequestInit) {
    const response = await fetch(`${SUPERMEMORY_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Supermemory API error (${response.status}): ${text}`);
    }
    return response.json();
}

// ─── Search memories ─────────────────────────────────────
export const searchMemoryTool = tool(
    async ({ query, containerTag }) => {
        try {
            const result = await supermemoryFetch('/search', {
                method: 'POST',
                body: JSON.stringify({
                    q: query,
                    containerTag: containerTag || DEFAULT_CONTAINER_TAG,
                    limit: 5,
                }),
            });
            return JSON.stringify(result, null, 2);
        } catch (error: any) {
            return `Error searching memories: ${error.message}`;
        }
    },
    {
        name: 'search_memories',
        description: 'Search for relevant past memories, facts, and user preferences. Use this to retrieve context from previous conversations.',
        schema: z.object({
            query: z.string().describe('The search query to find relevant memories.'),
            containerTag: z.string().optional().describe('Optional user/session tag. Defaults to default-user.'),
        }),
    }
);

// ─── Add a new memory ──────────────────────────────────
export const addMemoryTool = tool(
    async ({ content, containerTag, metadata }) => {
        try {
            await supermemoryFetch('/memories', {
                method: 'POST',
                body: JSON.stringify({
                    content,
                    containerTag: containerTag || DEFAULT_CONTAINER_TAG,
                    metadata,
                }),
            });
            return 'Memory saved successfully.';
        } catch (error: any) {
            return `Error saving memory: ${error.message}`;
        }
    },
    {
        name: 'add_memory',
        description: 'Store important facts, preferences, or information for future use. The agent should call this when the user shares something worth remembering.',
        schema: z.object({
            content: z.string().describe('The content to store as a memory.'),
            containerTag: z.string().optional().describe('Optional user/session tag.'),
            metadata: z.record(z.string(), z.any()).optional().describe('Optional metadata like timestamp, source, etc.'),
        }),
    }
);

// ─── (Optional) Get user profile ───────────────────────
export const profileTool = tool(
    async ({ containerTag }) => {
        try {
            const result = await supermemoryFetch('/profile', {
                method: 'GET',
                headers: {
                    'container-tag': containerTag || DEFAULT_CONTAINER_TAG,
                },
            });
            return JSON.stringify(result, null, 2);
        } catch (error: any) {
            return `Error fetching profile: ${error.message}`;
        }
    },
    {
        name: 'get_user_profile',
        description: 'Retrieve the current user profile, including preferences and stored information.',
        schema: z.object({
            containerTag: z.string().optional().describe('Optional user/session tag.'),
        }),
    }
);