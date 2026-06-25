// src/lib/embeddings.ts
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { Embeddings } from '@langchain/core/embeddings';
import { configDir } from '../context/ConfigContext';

let pipe: FeatureExtractionPipeline | null = null;

async function getPipeline(modelId: string): Promise<FeatureExtractionPipeline> {
    if (!pipe) {
        pipe = await pipeline('feature-extraction', modelId, {
            cache_dir: configDir,
            dtype: 'q8',
        });
    }
    return pipe;
}

/**
 * LangChain-compatible embedding class using @huggingface/transformers.
 */
export class LocalEmbeddings extends Embeddings {
    private modelId: string;
    private pipelineInstance: FeatureExtractionPipeline | null = null;

    constructor(modelId: string) {
        super({});
        this.modelId = modelId;
    }

    private async ensurePipeline(): Promise<FeatureExtractionPipeline> {
        if (!this.pipelineInstance) {
            this.pipelineInstance = await getPipeline(this.modelId);
        }
        return this.pipelineInstance;
    }

    /**
     * Embed a single text.
     */
    async embedQuery(text: string): Promise<number[]> {
        const p = await this.ensurePipeline();
        // For Jina models, use 'last' pooling; for others use 'mean'
        const result = await p(text, { pooling: 'last_token' });
        return this.extractVector(result);
    }

    /**
     * Embed multiple texts.
     */
    async embedDocuments(texts: string[]): Promise<number[][]> {
        const p = await this.ensurePipeline();
        const results = await Promise.all(texts.map(t => p(t, { pooling: 'last_token' })));
        return results.map(r => this.extractVector(r));
    }

    private extractVector(result: any): number[] {
        if (Array.isArray(result) && Array.isArray(result[0])) {
            return result[0] as number[];
        }
        if (Array.isArray(result)) {
            return result as number[];
        }
        // If it's a tensor, convert to array
        if (result && typeof result.tolist === 'function') {
            const arr = result.tolist();
            return Array.isArray(arr) && Array.isArray(arr[0]) ? arr[0] : arr;
        }
        throw new Error('Unexpected embedding format');
    }
}