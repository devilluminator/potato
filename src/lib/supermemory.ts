import Supermemory from 'supermemory';

const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY || 'potato';
const SUPERMEMORY_BASE_URL = 'http://localhost:8787';

export const memoryClient = new Supermemory({
    apiKey: SUPERMEMORY_API_KEY,
    baseURL: SUPERMEMORY_BASE_URL,
});

export const DEFAULT_CONTAINER_TAG = 'default-user';