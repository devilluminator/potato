import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';

// ─── Types ──────────────────────────────────────────────
type Item = {
    label: string;
    value: string;
    base_url?: string | null;
    api_key?: string | null;
};

type ModelSelectorModalProps = {
    provider: Item | null;
    onSelect: (model: string) => void;
    onClose: () => void;
};

// ─── Component ──────────────────────────────────────────
export const ModelSelectorModal: React.FC<ModelSelectorModalProps> = ({
    provider,
    onSelect,
    onClose,
}) => {
    const [models, setModels] = useState<string[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    // ─── Fetch models on mount ────────────────────────────
    useEffect(() => {
        if (!provider) return;
        const fetchModels = async () => {
            const url = provider.base_url || '';
            const key = provider.api_key || '';
            const base = url.endsWith('/') ? url : url + '/';
            const endpoint = base + 'v1/models';

            setLoading(true);
            setError(null);
            setModels([]);

            try {
                const headers: HeadersInit = { 'Content-Type': 'application/json' };
                if (key && key.trim() !== '') {
                    headers['Authorization'] = `Bearer ${key}`;
                }
                const response = await fetch(endpoint, { headers });
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
                }
                const data = await response.json();
                if (data && Array.isArray(data.data)) {
                    const modelIds = data.data
                        .map((m: any) => m.id)
                        .filter((id: any) => typeof id === 'string' && id.length > 0);
                    setModels(modelIds);
                    if (modelIds.length === 0) {
                        setError('No models found.');
                    }
                } else {
                    throw new Error('Unexpected response format.');
                }
            } catch (err: any) {
                setError(err.message || 'Failed to fetch models.');
            } finally {
                setLoading(false);
            }
        };
        fetchModels();
    }, [provider]);

    // ─── Handle Esc to close ──────────────────────────────
    useInput((_, key) => {
        if (key.escape) {
            onClose();
        }
    });

    // ─── Render states ─────────────────────────────────────
    if (!provider) {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="red">No provider selected. Please set up a provider first.</Text>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box gap={1}>
                <Text color="greenBright">
                    <Spinner type="dots" />
                </Text>
                <Text>Fetching models...</Text>
            </Box>
        );
    }

    if (error) {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="red">❌ {error}</Text>
                <Text dimColor>Press Esc to close</Text>
            </Box>
        );
    }

    if (models.length === 0) {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="red">No models found.</Text>
                <Text dimColor>Press Esc to close</Text>
            </Box>
        );
    }

    // ─── Render model list ─────────────────────────────────
    const items = models.map((id) => ({ label: id, value: id }));

    const CustomItem: React.FC<{ isSelected?: boolean; label: string }> = ({
        isSelected,
        label,
    }) => (
        <Text bold color={isSelected ? 'green' : undefined}>
            {label}
        </Text>
    );

    const CustomIndicator: React.FC<{ isSelected?: boolean }> = ({
        isSelected,
    }) => (isSelected ? <Text color="green">❯ </Text> : <Text> </Text>);

    return (
        <Box flexDirection="column" gap={1} borderStyle="round" borderColor="cyan" padding={1}>
            <Text bold color="cyan">
                📦 Select a new model (Ctrl+n to close)
            </Text>
            <Text bold color="green">
                {highlightedIndex + 1}/{models.length}
            </Text>

            <SelectInput
                items={items}
                onSelect={(item) => {
                    onSelect(item.value);
                    onClose();
                }}
                itemComponent={CustomItem}
                indicatorComponent={CustomIndicator}
                limit={9}
                onHighlight={(item) => {
                    const idx = items.findIndex((i) => i.value === item.value);
                    if (idx !== -1) setHighlightedIndex(idx);
                }}
            />

            <Box marginTop={1}>
                <Text dimColor>Use ↑↓ to select, Enter to confirm, Esc to close</Text>
            </Box>
        </Box>
    );
};