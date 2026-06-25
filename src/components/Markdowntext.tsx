import React, { useMemo } from 'react';
import { Text } from 'ink';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

// Configure marked once, at module load, not per-render.
marked.use(
    markedTerminal({
        // tune to taste — see marked-terminal README for all options
        // width: 80,
        // reflowText: true,
    })
);

type Props = {
    children: string | null | undefined;
};

/**
 * Renders a markdown string as ANSI-formatted text inside Ink.
 * Drop-in replacement for the unmaintained `ink-markdown` package,
 * which crashes under modern (ESM-only) `ink` + Bun.
 */
const MarkdownText: React.FC<Props> = ({ children }) => {
    const rendered = useMemo(() => {
        const source = children ?? '';
        if (!source) return '';
        try {
            const out = marked.parse(source);
            // marked.parse() is sync as long as no async extensions are used,
            // which is the case for markedTerminal.
            return typeof out === 'string' ? out.replace(/\n+$/, '') : source;
        } catch {
            // Fall back to raw text if parsing ever throws on malformed input.
            return source;
        }
    }, [children]);

    return <Text>{rendered}</Text>;
};

export default MarkdownText;