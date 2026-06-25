// src/lib/mcp.ts
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { configDir } from '../context/ConfigContext';

const MCP_CONFIG_PATH = path.join(configDir, 'mcp.json');
let isFirstRun = false;

// Ensure mcp.json exists; create a default one if missing
if (!existsSync(MCP_CONFIG_PATH)) {
    const defaultConfig = {
        mcpServers: {
            playwright: {
                command: 'npx',
                args: [
                    '@playwright/mcp@latest',
                    '--isolated',
                    '--image-responses',
                    'omit',
                    '--sandbox',
                ],
            },
            // Add other servers as needed, e.g.:
            // filesystem: {
            //   command: "npx",
            //   args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
            // },
        },
    };
    writeFileSync(MCP_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    isFirstRun = true;
    console.log(`📄 Created default mcp.json at ${MCP_CONFIG_PATH}`);
}

const mcpConfig = JSON.parse(readFileSync(MCP_CONFIG_PATH, 'utf-8'));
const serverCount = Object.keys(mcpConfig.mcpServers ?? {}).length;

/**
 * Initialise MCP clients and return LangChain tools.
 * Also returns the client instance so you can close connections on exit.
 */
export async function mcpTools() {
    // MultiServerMCPClient manages all servers defined in the config
    const client = new MultiServerMCPClient(mcpConfig.mcpServers);
    const tools = await client.getTools();
    return { tools, client, serverCount };
}