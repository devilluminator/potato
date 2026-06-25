import { createMiddleware } from 'langchain';
import { ToolMessage, type BaseMessage } from '@langchain/core/messages';

/**
 * Flattens a LangChain tool-message content value (which may be a plain
 * string, or an array of content blocks like [{type:'text', text:'...'}])
 * down to a single string.
 */
function stringifyToolContent(content: unknown): string {
    if (typeof content === 'string') return content;

    if (Array.isArray(content)) {
        return content
            .map((part: any) => {
                if (typeof part === 'string') return part;
                if (part && typeof part.text === 'string') return part.text;
                // Non-text blocks (images, etc.) — Ollama can't render these
                // anyway, so just leave a readable placeholder instead of
                // crashing on them.
                return `[${part?.type ?? 'content'} block omitted]`;
            })
            .join('\n');
    }

    if (content == null) return '';
    return JSON.stringify(content);
}

/**
 * Some providers (notably @langchain/ollama's ChatOllama) require
 * ToolMessage.content to be a plain string and throw
 * "Non string tool message content is not supported" otherwise.
 *
 * Several built-in deepagents tools (filesystem ops used for skills, e.g.
 * `read_file`, `ls`) return array-of-content-block results, which works
 * fine for OpenAI/Anthropic but breaks Ollama. This middleware normalizes
 * tool message content right before each model call, so it's safe to use
 * regardless of which provider is active.
 */
export const stringifyToolMessagesMiddleware = createMiddleware({
    name: 'StringifyToolMessages',
    wrapModelCall: (request, handler) => {
        const messages: BaseMessage[] = request.messages.map((msg) => {
            if (msg.getType() === 'tool' && typeof msg.content !== 'string') {
                const tm = msg as ToolMessage;
                return new ToolMessage({
                    content: stringifyToolContent(tm.content),
                    tool_call_id: tm.tool_call_id,
                    name: tm.name,
                    id: tm.id,
                    additional_kwargs: tm.additional_kwargs,
                });
            }
            return msg;
        });

        return handler({ ...request, messages });
    },
});