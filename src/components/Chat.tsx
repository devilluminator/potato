import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { MultilineInput } from 'ink-prompt';
import MarkdownText from './Markdowntext';
import { createDeepAgent, FilesystemBackend, listSkills } from 'deepagents';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { HumanMessage } from '@langchain/core/messages';
import { useConfig, pwd, configDir } from '../context/ConfigContext';
import Spinner from 'ink-spinner';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { runShellCommand } from '../tools/shell';
import { sqlExecutorTool } from '../tools/sqlite';
import { webSearch } from '../tools/websearch';
import { CODING_AGENT_SYSTEM_PROMPT } from '../utils/systemprompt';
import { stringifyToolMessagesMiddleware } from '../lib/stringifytoolmessages';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { searchMemoryTool, addMemoryTool } from '../tools/memoryTools';
import { addMessage, getConversationHistory } from '../lib/database';
import { ModelSelectorModal } from './ModelSelectorModal';
import { mcpTools } from '../lib/mcp';

// ─── Types ──────────────────────────────────────────────
type MessageMetrics = {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    durationSec: number;
};

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
    thinking?: string;
    metrics?: MessageMetrics;
};

// ─── Component ──────────────────────────────────────────
export const Chat: React.FC = () => {
    const { provider, model, setConfig } = useConfig();

    const hashedPwdDisplay =
        typeof pwd === 'string' && pwd.length > 0
            ? createHash('md5').update(pwd).digest('hex')
            : './~';

    const threadId = hashedPwdDisplay || 'default-thread';

    // SQLite tool
    const sqliteToolRef = useRef(sqlExecutorTool);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [currentResponse, setCurrentResponse] = useState<string>('');
    const [currentThinking, setCurrentThinking] = useState<string>('');
    const [mcpClient, setMcpClient] = useState<any>(null);
    const [mcpToolsList, setMcpToolsList] = useState<any[]>([]);

    // ─── Loading state ─────────────────────────────────────
    const [isLoading, setIsLoading] = useState(true);

    // ─── Model selector modal ─────────────────────────────
    const [showModelSelector, setShowModelSelector] = useState<boolean>(false);

    // Automatically open model selector if no model is set
    useEffect(() => {
        if (!model) {
            setShowModelSelector(true);
        }
    }, [model]);

    // ─── LangGraph checkpoint ─────────────────────────────
    const checkpointerRef = useRef<MemorySaver | null>(new MemorySaver());

    // ─── Skills state ──────────────────────────────────────
    const [skills, setSkills] = useState<Array<{ name: string; description: string }>>([]);
    const [showSkills, setShowSkills] = useState<boolean>(false);

    const abortControllerRef = useRef<AbortController | null>(null);
    const mcpClientRef = useRef<any>(null);

    // ─── Combined initialisation ──────────────────────────
    useEffect(() => {
        const init = async () => {
            try {
                // 1. Load conversation history
                const history = getConversationHistory(threadId, 50);
                if (history.length > 0) {
                    const formatted = history.map((msg) => ({
                        role: msg.role as 'user' | 'assistant',
                        content: msg.content,
                    }));
                    setMessages(formatted);
                    console.log(`📜 Loaded ${formatted.length} messages from history.`);
                }

                // 2. Load skills
                try {
                    const skillsList = listSkills({ userSkillsDir: path.join(configDir, 'skills') });
                    setSkills(skillsList);
                } catch {
                    setSkills([]);
                }

                // 3. Load MCP tools
                try {
                    const { tools, client, serverCount } = await mcpTools();
                    if (serverCount > 0) {
                        setMcpToolsList(tools);
                        setMcpClient(client);
                        mcpClientRef.current = client;
                        console.log(`✅ Loaded ${tools.length} tools from ${serverCount} MCP server(s)`);
                    } else {
                        console.log('ℹ️ No MCP servers configured');
                    }
                } catch (err) {
                    console.error('❌ Failed to load MCP tools:', err);
                }
            } catch (err) {
                console.error('❌ Initialization error:', err);
            } finally {
                setIsLoading(false);
            }
        };

        init();

        // ─── Cleanup MCP client on unmount ─────────────────
        return () => {
            if (mcpClientRef.current) {
                mcpClientRef.current.close().catch(console.error);
            }
        };
    }, [threadId]);

    // ─── Ctrl+C / exit handler ────────────────────────────
    useEffect(() => {
        const handleExit = async () => {
            if (mcpClientRef.current) {
                await mcpClientRef.current.close().catch(console.error);
            }
            process.exit(0);
        };

        const sigintHandler = () => {
            handleExit();
        };

        process.on('SIGINT', sigintHandler);
        process.on('SIGTERM', sigintHandler);

        return () => {
            process.off('SIGINT', sigintHandler);
            process.off('SIGTERM', sigintHandler);
        };
    }, []);

    // ─── Keyboard handling ─────────────────────────────────
    useInput((input, key) => {
        if (key.ctrl && input === 'n') {
            setShowModelSelector((prev) => !prev);
            return;
        }
        if (key.escape && isProcessing) {
            abortControllerRef.current?.abort();
            return;
        }
        if (inputValue.trim() === '/skill' && !showSkills) {
            setShowSkills(true);
            setInputValue('');
            return;
        }
    });

    // ─── Submit handler ────────────────────────────────────
    const handleSubmit = useCallback(
        async (userInput: string) => {
            if (!provider || !model || !userInput.trim()) return;
            if (isProcessing) return;

            if (showSkills) setShowSkills(false);

            setCurrentResponse('');
            setCurrentThinking('');
            setIsProcessing(true);

            const userMsg: ChatMessage = { role: 'user', content: userInput.trim() };
            setMessages((prev) => [...prev, userMsg]);
            setInputValue('');

            try {
                addMessage(threadId, 'user', userInput.trim());
            } catch (err) {
                console.warn('Failed to save user message:', err);
            }

            const controller = new AbortController();
            abortControllerRef.current = controller;
            const signal = controller.signal;

            const startTime = Date.now();

            try {
                let baseURL = provider.base_url || '';
                if (!baseURL.endsWith('/v1')) {
                    baseURL = baseURL.replace(/\/$/, '') + '/v1';
                }

                const llm =
                    provider.label.toLowerCase() !== 'ollama'
                        ? new ChatOpenAI({
                            model: model,
                            apiKey: provider.api_key || undefined,
                            configuration: { baseURL },
                            temperature: 0.3,
                            reasoning: { effort: 'high' },
                        })
                        : new ChatOllama({
                            model: model,
                            baseUrl: provider.base_url ?? undefined,
                            temperature: 0.3,
                            think: true,
                        });

                const backend = new FilesystemBackend({ rootDir: configDir });

                const agent = createDeepAgent({
                    model: llm,
                    tools: [
                        runShellCommand,
                        sqliteToolRef.current,
                        webSearch,
                        searchMemoryTool,
                        addMemoryTool,
                        ...mcpToolsList,
                    ],
                    systemPrompt: CODING_AGENT_SYSTEM_PROMPT,
                    backend,
                    skills: [path.join(configDir, 'skills')],
                    middleware: [stringifyToolMessagesMiddleware],
                    checkpointer: checkpointerRef.current!,
                });

                const fullMessages = [new HumanMessage(userInput.trim())];

                const stream = agent.streamEvents(
                    { messages: fullMessages },
                    {
                        signal,
                        version: 'v2',
                        configurable: { thread_id: hashedPwdDisplay },
                        recursionLimit: 100,
                    }
                );

                let assistantResponse = '';
                let thinkingContent = '';
                let metrics: MessageMetrics | undefined;

                for await (const event of stream) {
                    if (event.event === 'on_chat_model_stream') {
                        const chunk = event.data?.chunk;
                        if (chunk) {
                            const content = chunk.content;
                            if (typeof content === 'string' && content.length > 0) {
                                assistantResponse += content;
                                setCurrentResponse(assistantResponse);
                            }
                            const reasoning = chunk.additional_kwargs?.reasoning_content;
                            if (typeof reasoning === 'string' && reasoning.length > 0) {
                                thinkingContent += reasoning;
                                setCurrentThinking(thinkingContent);
                            }
                        }
                    }

                    if (event.event === 'on_chain_end' && event.name === 'LangGraph') {
                        const outputMessages = event.data?.output?.messages;
                        if (outputMessages && outputMessages.length > 0) {
                            const lastMsg = outputMessages[outputMessages.length - 1];
                            const finalContent = assistantResponse || lastMsg?.content || '';

                            const usage = lastMsg?.usage_metadata;
                            if (usage) {
                                const inputTokens = usage.input_tokens || 0;
                                const outputTokens = usage.output_tokens || 0;
                                const totalTokens = usage.total_tokens || 0;

                                const durationNs = lastMsg?.response_metadata?.total_duration;
                                let durationSec = (Date.now() - startTime) / 1000;
                                if (durationNs && typeof durationNs === 'number') {
                                    durationSec = durationNs / 1_000_000_000;
                                }

                                metrics = {
                                    inputTokens,
                                    outputTokens,
                                    totalTokens,
                                    durationSec: Math.round(durationSec * 100) / 100,
                                };
                            }

                            if (finalContent) {
                                const assistantMsg: ChatMessage = {
                                    role: 'assistant',
                                    content: finalContent,
                                    thinking: thinkingContent || undefined,
                                    metrics,
                                };
                                setMessages((prev) => [...prev, assistantMsg]);
                                setCurrentResponse('');
                                setCurrentThinking('');

                                try {
                                    addMessage(threadId, 'assistant', finalContent);
                                } catch (err) {
                                    console.warn('Failed to save assistant message:', err);
                                }
                            }
                        }
                    }
                }
            } catch (error: any) {
                if (error.name === 'AbortError') {
                    setCurrentResponse((prev) => prev + '\n\n⏹️ Cancelled.');
                } else {
                    const errorMsg: ChatMessage = {
                        role: 'assistant',
                        content: `❌ Error: ${error.message || 'Unknown error'}`,
                    };
                    setMessages((prev) => [...prev, errorMsg]);
                }
            } finally {
                setIsProcessing(false);
                setCurrentResponse('');
                setCurrentThinking('');
                abortControllerRef.current = null;
            }
        },
        [provider, model, isProcessing, showSkills, threadId, mcpToolsList]
    );

    const formatNumber = (num: number): string => {
        if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
        if (num >= 1_000) return (num / 1_000).toFixed(1) + 'k';
        return num.toString();
    };

    // ─── Init config ──────────────────────────────────────
    useEffect(() => {
        const initConfig = async () => {
            try {
                await mkdir(configDir, { recursive: true });
                console.log(`📁 Config directory ready: ${configDir}`);

                const skillsDir = path.join(configDir, 'skills');
                await mkdir(skillsDir, { recursive: true });
                console.log(`📁 Skills directory ready: ${skillsDir}`);

                const initPath = path.join('init.json');
                const file = Bun.file(initPath);
                const exists = await file.exists();
                if (!exists) {
                    await Bun.write(initPath, JSON.stringify({ locked: false, session: hashedPwdDisplay }, null, 2));
                    console.log('✅ Created default init.json');
                } else {
                    console.log('ℹ️ init.json already exists');
                }

                const settingsFile = path.join(configDir, 'settings.json');
                const settings = Bun.file(settingsFile);
                if (await settings.exists()) {
                    const content = await settings.text();
                    const parsed = JSON.parse(content);
                    console.log('✅ Settings loaded:', parsed);
                } else {
                    console.log(`ℹ️ No settings.json found at ${settingsFile}`);
                }
            } catch (err) {
                console.error('❌ Error during initialization:', err);
            }
        };
        initConfig();
    }, []);

    // ─── Render ───────────────────────────────────────────
    if (isLoading) {
        return (
            <Box flexDirection="column" paddingX={1} gap={1}>
                <Box gap={1}>
                    <Text color="greenBright">
                        <Spinner type="dots" />
                    </Text>
                    <Text>Loading chat…</Text>
                </Box>
                <Text dimColor>Initialising history, skills, MCP servers…</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" paddingX={1} gap={1}>
            <Text dimColor>Session: {hashedPwdDisplay}</Text>

            {!model && (
                <Text color="yellow">No model selected. Press Ctrl+n to choose one.</Text>
            )}

            <Box flexDirection="column">
                {messages.map((msg, idx) => (
                    <Box key={idx} flexDirection="column" gap={0}>
                        {msg.role === 'user' ? (
                            <Box borderStyle="round" borderBottom borderTop={false} borderLeft borderRight={false} borderColor="blue">
                                <Text dimColor>📝 {msg.content}</Text>
                            </Box>
                        ) : (
                            <Box flexDirection="column" gap={0}>
                                {msg.thinking && (
                                    <Box borderStyle="round" borderBottom borderTop={false} borderLeft borderRight={false} borderColor="gray">
                                        <Text dimColor>Thoughts:{"\n"}{msg.thinking}</Text>
                                    </Box>
                                )}
                                <Box borderStyle="round" gap={1} borderBottom borderTop={false} borderLeft borderRight={false} borderColor="green">
                                    <Text>✨</Text>
                                    <MarkdownText>{msg.content}</MarkdownText>
                                </Box>
                                {msg.metrics && (
                                    <Box marginTop={0} marginBottom={1}>
                                        <Text dimColor>
                                            {msg.metrics.durationSec.toFixed(2)}s ·{' '}
                                            {formatNumber(msg.metrics.inputTokens)} ↓ ·{' '}
                                            {formatNumber(msg.metrics.outputTokens)} ↑ ·{' '}
                                            ~{formatNumber(msg.metrics.totalTokens)} total
                                        </Text>
                                    </Box>
                                )}
                            </Box>
                        )}
                    </Box>
                ))}

                {isProcessing && (
                    <Box flexDirection="column" gap={0}>
                        {currentThinking && (
                            <Box borderStyle="round" borderBottom borderTop={false} borderLeft borderRight={false} borderColor="gray">
                                <Text dimColor>Thoughts:{"\n"}"{currentThinking}</Text>
                            </Box>
                        )}
                        {currentResponse && (
                            <Box borderStyle="round" borderBottom borderTop={false} borderLeft borderRight={false} borderColor="green">
                                <Text>{currentResponse}</Text>
                            </Box>
                        )}
                        {!currentResponse && (
                            <Box gap={1}>
                                <Text color="green"><Spinner type="dots" /></Text>
                                <Text>Thinking…</Text>
                            </Box>
                        )}
                        <Text dimColor>Press Esc to cancel</Text>
                    </Box>
                )}
            </Box>

            {/* ─── Skills panel ────────────────────────────────── */}
            {showSkills && (
                <Box flexDirection="column" marginY={0} paddingX={0}>
                    <Box borderStyle="round" borderDimColor paddingX={1} paddingY={0} flexDirection="column">
                        <Text bold color="blueBright">🛠 Available Skills</Text>
                        {skills.length > 0 ? (
                            skills.map((skill, idx) => (
                                <Box key={idx} marginTop={0}>
                                    <Text dimColor>• {skill.name} — {skill.description}</Text>
                                </Box>
                            ))
                        ) : (
                            <Text dimColor>No skills found in ~/.potato/skills/</Text>
                        )}
                    </Box>
                </Box>
            )}

            {/* ─── Model Selector Modal ───────────────────────── */}
            {showModelSelector && provider && (
                <ModelSelectorModal
                    provider={provider}
                    onSelect={(newModel) => {
                        setConfig(provider, newModel, null);
                        setShowModelSelector(false);
                    }}
                    onClose={() => setShowModelSelector(false)}
                />
            )}

            {/* ─── Input ───────────────────────────────────── */}
            <Box marginTop={1} flexDirection="column" gap={0} marginBottom={1}>
                <Box>
                    <Box width={2}>
                        <Text color="blueBright">❯</Text>
                    </Box>
                    <MultilineInput
                        value={inputValue}
                        onChange={setInputValue}
                        onSubmit={handleSubmit}
                        placeholder={
                            isProcessing
                                ? 'Waiting for response…'
                                : model
                                    ? 'Type your prompt… (Ctrl+j for newline)'
                                    : 'Select a model first (Ctrl+n)'
                        }
                        isActive={!isProcessing && !!model}
                        showCursor
                    />
                </Box>
            </Box>
        </Box>
    );
};