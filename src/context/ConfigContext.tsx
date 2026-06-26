import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { homedir } from 'node:os';
import path, { resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cwd } from 'node:process';

// ─── Path constants ────────────────────────────────────
export const home = homedir();
export const configDir = path.join(home, '.potato');
export const settingsFile = path.join(configDir, 'settings.json');
export const initFile = path.join(configDir, 'init.json');
export const MCP_CONFIG_PATH = path.join(configDir, 'mcp.json');
export const pwd = cwd()

export function isCurrentDirectoryHome(): boolean {
    const normalizedCwd = resolve(process.cwd());
    const normalizedHome = resolve(homedir());
    return normalizedCwd === normalizedHome;
}

// ─── Types ─────────────────────────────────────────────
export type ProviderItem = {
    label: string;
    value: string;
    base_url?: string | null;
    api_key?: string | null;
};

export type huggingface_embed_models = string | null;

export type Settings = {
    provider: {
        label: string;
        value: string;
        base_url: string;
        api_key: string;
    };
    model: string;
    huggingface_embed_models: huggingface_embed_models;
};

interface ConfigContextType {
    provider: ProviderItem | null;
    model: string | null;
    huggingface_embed_models: huggingface_embed_models;
    locked: boolean;
    /** Set provider + model together (and optionally embed model) */
    setConfig: (provider: ProviderItem, model: string, huggingface_embed_models?: huggingface_embed_models) => void;
    /** Set only the embedding model — persists without touching provider/model */
    setEmbedModel: (modelId: string) => void;
    /** Toggle lock state and persist to init.json */
    setLocked: (locked: boolean) => void;
    resetConfig: () => void;
}

// ─── Helpers ───────────────────────────────────────────
function ensureConfigDir() {
    try {
        mkdirSync(configDir, { recursive: true });
    } catch {
        // ignore
    }
}

function readInitFile(): { locked: boolean } {
    ensureConfigDir();
    try {
        if (existsSync(initFile)) {
            const content = readFileSync(initFile, 'utf-8');
            const data = JSON.parse(content);
            return { locked: data.locked === true };
        }
    } catch {
        // ignore
    }
    return { locked: false };
}

function writeInitFile(locked: boolean) {
    ensureConfigDir();
    try {
        let data: any = { locked };
        if (existsSync(initFile)) {
            const content = readFileSync(initFile, 'utf-8');
            const existing = JSON.parse(content);
            data = { ...existing, locked };
        }
        writeFileSync(initFile, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Failed to write init.json:', e);
    }
}

// ─── Context ───────────────────────────────────────────
const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [provider, setProvider] = useState<ProviderItem | null>(null);
    const [model, setModel] = useState<string | null>(null);
    const [hfEmbedModel, setHfEmbedModel] = useState<huggingface_embed_models>(null);
    const [locked, setLockedState] = useState<boolean>(() => readInitFile().locked);

    // ─── Persist settings (provider, model, embed) ─────
    const persist = (prov: ProviderItem | null, mod: string | null, embed: huggingface_embed_models) => {
        if (!prov || !mod) return;
        try {
            ensureConfigDir();
            writeFileSync(settingsFile, JSON.stringify({ provider: prov, model: mod, huggingface_embed_models: embed }, null, 2));
        } catch (e) {
            console.error('Failed to write settings:', e);
        }
    };

    const setConfig = (prov: ProviderItem, mod: string, embed: huggingface_embed_models = hfEmbedModel) => {
        setProvider(prov);
        setModel(mod);
        setHfEmbedModel(embed ?? null);
        persist(prov, mod, embed ?? null);
    };

    const setEmbedModel = (modelId: string) => {
        setHfEmbedModel(modelId);
        persist(provider, model, modelId);
    };

    const setLocked = (newLocked: boolean) => {
        setLockedState(newLocked);
        writeInitFile(newLocked);
    };

    const resetConfig = () => {
        setProvider(null);
        setModel(null);
        setHfEmbedModel(null);
        setLockedState(false);
        writeInitFile(false);
    };

    // ─── On mount, ensure config dir exists ────────────
    useEffect(() => {
        ensureConfigDir();
    }, []);

    return (
        <ConfigContext.Provider
            value={{
                provider,
                model,
                huggingface_embed_models: hfEmbedModel,
                locked,
                setConfig,
                setEmbedModel,
                setLocked,
                resetConfig,
            }}
        >
            {children}
        </ConfigContext.Provider>
    );
};

export const useConfig = () => {
    const context = useContext(ConfigContext);
    if (!context) throw new Error('useConfig must be used within a ConfigProvider');
    return context;
};