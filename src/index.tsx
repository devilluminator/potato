import React, { useEffect } from 'react';
import { render, Box, useInput } from 'ink';
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
          // Provider and model are enough now – embed model is handled by Supermemory
          setConfig(settings.provider, settings.model, null);
        }
      } catch (err) {
        console.error('❌ Error while checking/creating config:', err);
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

  const isConfigured = provider !== null && model !== null;

  return (
    <Box flexDirection="column" flexGrow={1} marginBottom={1}>
      <Logo />

      {!isConfigured && <Provider />}
      {isConfigured && <Chat />}
      {isConfigured && <Footer />}
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