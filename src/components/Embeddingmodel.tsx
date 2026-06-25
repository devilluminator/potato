import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { pipeline } from '@huggingface/transformers';
import { configDir, useConfig } from '../context/ConfigContext';

// ─── Available models ──────────────────────────────────────────────────────────
const MODELS = [
    {
        label: 'Lightweight (fastest) — all-MiniLM-L6-v2  (~22 MB · English only)',
        value: 'Xenova/all-MiniLM-L6-v2',
        size: '~22 MB',
        langs: 'English only',
        tier: 'light',
        recommended: false,
    },
    {
        label: 'Balanced (recommended) — granite-embedding-97m-multilingual-r2  (~97 MB · 200+ langs)',
        value: 'ibm-granite/granite-embedding-97m-multilingual-r2',
        size: '~97 MB',
        langs: '200+ languages',
        tier: 'balanced',
        recommended: true,
    },
    {
        label: 'Best quality — jina-embeddings-v5-text-small  (~1.5 GB · 119+ langs)',
        value: 'jinaai/jina-embeddings-v5-text-small',
        size: '~1.5 GB',
        langs: '119+ languages',
        tier: 'best',
        recommended: false,
    },
] as const;

// ─── Types ─────────────────────────────────────────────────────────────────────
type Step = 'explain' | 'select' | 'downloading' | 'done' | 'error';

type FileProgress = {
    file: string;
    progress: number; // 0-100
    loaded: number;
    total: number;
    done: boolean;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function progressBar(pct: number, width = 30): string {
    const filled = Math.round((pct / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const ExplainStep: React.FC<{ onContinue: () => void }> = ({ onContinue }) => {
    useInput((_, key) => {
        if (key.return) onContinue();
    });

    return (
        <Box flexDirection="column" gap={1}>
            <Box flexDirection="column" gap={0}>
                <Text bold color="blueBright">⭐ Embedding Model Setup</Text>
            </Box>

            <Box flexDirection="column" paddingX={1} gap={1}
                borderStyle="round" borderColor="gray">
                <Text>
                    Downloading a single local embedding model to power memory —
                    all vectors stay compatible no matter which LLM you switch to later.
                </Text>
                <Text dimColor>
                    You can change the LLM at any time — the embedding model stays independent.
                </Text>
            </Box>

            <Text dimColor>Press Enter to choose a model →</Text>
        </Box>
    );
};

const SelectStep: React.FC<{
    onSelect: (model: typeof MODELS[number]) => void;
    onBack: () => void;
}> = ({ onSelect, onBack }) => {
    useInput((_, key) => {
        if (key.escape) onBack();
    });

    const items = MODELS.map((m) => ({
        label: m.label,
        value: m.value,
    }));

    const CustomItem: React.FC<{ isSelected?: boolean; label: string }> = ({ isSelected, label }) => (
        <Text color={isSelected ? 'blueBright' : undefined} bold={isSelected}>
            {label}
        </Text>
    );

    const CustomIndicator: React.FC<{ isSelected?: boolean }> = ({ isSelected }) => (
        isSelected ? <Text color="blueBright">❯ </Text> : <Text>  </Text>
    );

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold color="blueBright">📦 Choose embedding model:</Text>

            <Box flexDirection="column" paddingX={1}>
                {MODELS.map((m) => (
                    <Box key={m.value} flexDirection="column" marginBottom={1}>
                        <Text bold color={m.recommended ? 'green' : 'white'}>
                            {m.recommended ? '★ ' : '  '}{m.value.split('/')[1]}
                            {m.recommended ? <Text color="green"> (recommended)</Text> : null}
                        </Text>
                        <Text dimColor>    {m.size} · {m.langs}</Text>
                    </Box>
                ))}
            </Box>

            <SelectInput
                items={items}
                onSelect={(item) => {
                    const model = MODELS.find((m) => m.value === item.value)!;
                    onSelect(model);
                }}
                itemComponent={CustomItem}
                indicatorComponent={CustomIndicator}
            />
            <Text dimColor>↑↓ to move · Enter to select · Esc to go back</Text>
        </Box>
    );
};

const DownloadStep: React.FC<{
    modelId: string;
    files: Record<string, FileProgress>;
    overallPct: number;
}> = ({ modelId, files, overallPct }) => {
    const fileList = Object.values(files);
    const activeFile = [...fileList].reverse().find((f) => !f.done && f.progress > 0);

    return (
        <Box flexDirection="column" gap={1}>
            <Box gap={1}>
                <Text color="green"><Spinner type="dots" /></Text>
                <Text bold>Downloading <Text color="blueBright">{modelId}</Text>…</Text>
            </Box>

            {/* Overall bar */}
            <Box flexDirection="column" paddingX={1}>
                <Text>
                    <Text color="green">[{progressBar(overallPct)}]</Text>
                    {' '}<Text bold>{overallPct.toFixed(0)}%</Text>
                    {' '}<Text dimColor>overall</Text>
                </Text>
            </Box>

            {/* Per-file progress */}
            {fileList.length > 0 && (
                <Box flexDirection="column" paddingX={1} gap={0}>
                    {fileList.map((f) => (
                        <Box key={f.file} gap={1}>
                            <Text color={f.done ? 'green' : 'gray'}>
                                {f.done ? '✓' : '·'}
                            </Text>
                            <Text dimColor={f.done}>
                                {f.file.split('/').pop()?.slice(0, 38).padEnd(38, ' ')}
                            </Text>
                            {!f.done && f.progress > 0 && (
                                <Text color="blueBright">{f.progress.toFixed(0).padStart(3)}%</Text>
                            )}
                            {f.done && (
                                <Text dimColor>{formatBytes(f.total)}</Text>
                            )}
                        </Box>
                    ))}
                </Box>
            )}

            {activeFile && (
                <Box paddingX={1}>
                    <Text dimColor>
                        {formatBytes(activeFile.loaded)} / {formatBytes(activeFile.total)}
                    </Text>
                </Box>
            )}

            <Text dimColor>This is a one-time download — future starts load from disk in ~1s</Text>
        </Box>
    );
};

// ─── Main component ────────────────────────────────────────────────────────────
export const EmbeddingModel: React.FC = () => {
    const { setEmbedModel } = useConfig();

    const [step, setStep] = useState<Step>('explain');
    const [selectedModel, setSelectedModel] = useState<typeof MODELS[number] | null>(null);
    const [files, setFiles] = useState<Record<string, FileProgress>>({});
    const [overallPct, setOverallPct] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const startDownload = useCallback(async (model: typeof MODELS[number]) => {
        setSelectedModel(model);
        setStep('downloading');
        setFiles({});
        setOverallPct(0);

        const fileMap: Record<string, FileProgress> = {};

        const updateOverall = () => {
            const vals = Object.values(fileMap);
            if (vals.length === 0) return;
            const avg = vals.reduce((s, f) => s + (f.done ? 100 : f.progress), 0) / vals.length;
            setOverallPct(Math.round(avg));
        };

        try {
            // Use pipeline to download and load the model
            await pipeline('feature-extraction', model.value, {
                dtype: 'q8', // quantised for speed, still good quality
                cache_dir: configDir,
                // @ts-ignore – progress_callback is valid
                progress_callback: (p: any) => {
                    const fileName: string = p.file ?? p.name ?? 'unknown';
                    const shortName = fileName.split('/').pop() ?? fileName;

                    if (p.status === 'initiate') {
                        fileMap[shortName] = { file: shortName, progress: 0, loaded: 0, total: 0, done: false };
                        setFiles({ ...fileMap });

                    } else if (p.status === 'progress' || p.status === 'downloading') {
                        fileMap[shortName] = {
                            file: shortName,
                            progress: p.progress ?? 0,
                            loaded: p.loaded ?? 0,
                            total: p.total ?? 0,
                            done: false,
                        };
                        setFiles({ ...fileMap });
                        updateOverall();

                    } else if (p.status === 'done' || p.status === 'ready') {
                        if (fileMap[shortName]) {
                            fileMap[shortName] = { ...fileMap[shortName], progress: 100, done: true };
                        }
                        setFiles({ ...fileMap });
                        updateOverall();
                    }
                },
            });

            setOverallPct(100);
            setStep('done');
            await Bun.sleep(1200); // brief pause to show completion
            setEmbedModel(model.value);

        } catch (err: any) {
            setError(err.message ?? String(err));
            setStep('error');
        }
    }, [setEmbedModel]);

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <Box flexDirection="column" paddingX={1} gap={1}>

            {step === 'explain' && (
                <ExplainStep onContinue={() => setStep('select')} />
            )}

            {step === 'select' && (
                <SelectStep
                    onSelect={startDownload}
                    onBack={() => setStep('explain')}
                />
            )}

            {step === 'downloading' && selectedModel && (
                <DownloadStep
                    modelId={selectedModel.value}
                    files={files}
                    overallPct={overallPct}
                />
            )}

            {step === 'done' && (
                <Box flexDirection="column" gap={1}>
                    <Box gap={1}>
                        <Text color="green">✓</Text>
                        <Text bold>Model ready!</Text>
                    </Box>
                    <Text dimColor>All future starts use the cached model — no re‑download needed.</Text>
                    <Text dimColor>Starting chat…</Text>
                </Box>
            )}

            {step === 'error' && (
                <Box flexDirection="column" gap={1}>
                    <Text color="red">❌ Download failed</Text>
                    <Text dimColor>{error}</Text>
                    <Text dimColor>Check your internet connection and try again. Press Ctrl+R to restart.</Text>
                </Box>
            )}
        </Box>
    );
};