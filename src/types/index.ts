export type Provider = "openai" | "ollama" | "lmstudio" | null;

export type OpenAIStatus = {
    emoji: string;
    message: string;
    valid: boolean;
};

type OllamaModel = {
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details: {
        parent_model: string;
        format: string;
        family: string;
        families: string[];
        parameter_size: string;
        quantization_level: string;
    };
};

export type OllamaModelsResponse = {
    models: OllamaModel[];
};

export type ConversationMessage = {
    id?: number;
    thread_id: string;
    role: "user" | "assistant" | "system";
    content: string;
    created_at?: string;
};
