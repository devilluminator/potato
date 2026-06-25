import React, { useEffect, useState } from 'react';
import { render, Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { mkdir } from 'node:fs/promises';
import Logo from './components/Logo';
import { Provider } from './components/Provider';
import { Chat } from './components/Chat';
import Footer from './components/Footer';
import { ConfigProvider, useConfig, configDir, settingsFile } from './context/ConfigContext';
import type { Settings } from './context/ConfigContext';

// ─── App component ────────────────────────────────────
const App = () => {
  const { provider, model, resetConfig, setConfig } = useConfig();
  const [isLoading, setIsLoading] = useState(true);

  // ─── Directory + settings check ─────────────────────
  useEffect(() => {
    const checkConfig = async () => {
      try {
        await mkdir(configDir, { recursive: true });

        const file = Bun.file(settingsFile);
        const exists = await file.exists();

        if (exists) {
          const content = await file.text();
          const settings: Settings = JSON.parse(content);
          setConfig(settings.provider, settings.model, null);
        }
      } catch (err) {
        console.error('❌ Error while checking/creating config:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkConfig();
  }, []);

  // ─── Ctrl+R to reset back to provider setup ──────────
  useInput((input, key) => {
    if (key.ctrl && input === 'r' && provider && model) {
      resetConfig();
    }
  });

  // ─── Loading state ────────────────────────────────────
  if (isLoading) {
    return (
      <Box flexDirection="column" flexGrow={1} marginBottom={1}>
        <Logo />
        <Box marginTop={1} gap={1}>
          <Text color="greenBright">
            <Spinner type="dots" />
          </Text>
          <Text>Loading configuration…</Text>
        </Box>
      </Box>
    );
  }

  const isConfigured = provider !== null && model !== null;

  if (!isConfigured) {
    return (
      <Box flexDirection="column" flexGrow={1} marginBottom={1}>
        <Logo />
        <Provider />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} marginBottom={1}>
      <Chat />
      <Footer />
    </Box>
  );
};

// ─── Root with provider ──────────────────────────────
const Root = () => (
  <ConfigProvider>
    <App />
  </ConfigProvider>
);

render(<Root />);