import { tool } from 'langchain';
import { z } from 'zod';
import { useConfig } from '../context/ConfigContext';



// ─── Configuration ──────────────────────────────────────
const OLLAMA_MEMORY_BASE_URL =
    process.env.OLLAMA_MEMORY_BASE_URL || 'http://localhost:3609';

// ─── Helper: fetch with error handling ──────────────────
async function ollamaMemoryFetch(endpoint: string, options: RequestInit) {
    const response = await fetch(`${OLLAMA_MEMORY_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ollama Memory API error (${response.status}): ${text}`);
    }
    return response.json();
}

// ─── Tool: Search memories ──────────────────────────────
export const searchMemoryTool = tool(
    async ({ query, sessionId, limit }) => {
        const { locked } = useConfig();

        try {
            const result = await ollamaMemoryFetch('/search', {
                method: 'POST',
                body: JSON.stringify({
                    query,
                    session_id: sessionId || 'default-user',
                    sandbox: locked,
                    limit: limit ?? 30,
                }),
            });
            return JSON.stringify(result, null, 2);
        } catch (error: any) {
            return `Error searching memories: ${error.message}`;
        }
    },
    {
        name: 'search_memories',
        description:
            'Search for relevant past memories, facts, and user preferences. Use this to retrieve context from previous conversations.',
        schema: z.object({
            query: z.string().describe('The search query to find relevant memories.'),
            sessionId: z
                .string()
                .optional()
                .describe('Optional user/session ID. Defaults to default-user.'),
            limit: z
                .number()
                .optional()
                .describe('Maximum number of results to return. Defaults to 30.'),
        }),
    }
);

// ─── Tool: Add a new memory ─────────────────────────────
export const addMemoryTool = tool(
    async ({ query, sessionId }) => {
        try {
            const result = await ollamaMemoryFetch('/add', {
                method: 'POST',
                body: JSON.stringify({
                    query,
                    session_id: sessionId || 'default-user',
                }),
            });
            return JSON.stringify(result, null, 2);
        } catch (error: any) {
            return `Error saving memory: ${error.message}`;
        }
    },
    {
        name: 'add_memory',
        description:
            'Store important facts, preferences, or information for future use. The agent should call this when the user shares something worth remembering.',
        schema: z.object({
            query: z.string().describe('The content to store as a memory.'),
            sessionId: z
                .string()
                .optional()
                .describe('Session ID. Defaults to default-user.'),
        }),
    }
);

// ─── Tool: Delete all memories for a session ────────────
export const deleteMemoryTool = tool(
    async ({ sessionId }) => {
        try {
            const result = await ollamaMemoryFetch('/delete', {
                method: 'DELETE',
                body: JSON.stringify({
                    session_id: sessionId || 'default-user',
                }),
            });
            return JSON.stringify(result, null, 2);
        } catch (error: any) {
            return `Error deleting memories: ${error.message}`;
        }
    },
    {
        name: 'delete_memories',
        description: 'Delete all memories associated with a session ID.',
        schema: z.object({
            sessionId: z
                .string()
                .optional()
                .describe('Session ID to delete memories for. Defaults to default-user.'),
        }),
    }
);

// ─── Export all tools as a collection ────────────────────
export const ollamaMemoryTools = [
    searchMemoryTool,
    addMemoryTool,
    deleteMemoryTool,
];