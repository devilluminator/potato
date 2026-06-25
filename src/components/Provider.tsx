import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { useConfig } from '../context/ConfigContext';

// ─── Types ──────────────────────────────────────────────
type Item = {
  label: string;
  value: string;
  base_url?: string | null;
  api_key?: string | null;
};

// ─── Provider selection list ──────────────────────────
const SelectProvider: React.FC<{
  items: Item[];
  onSelect: (item: Item) => void;
}> = ({ items, onSelect }) => {
  const CustomItem: React.FC<{ isSelected?: boolean; label: string }> = ({
    isSelected,
    label,
  }) => (
    <Text bold color={isSelected ? 'blueBright' : undefined}>
      {label}
    </Text>
  );

  const CustomIndicator: React.FC<{ isSelected?: boolean }> = ({
    isSelected,
  }) => (isSelected ? <Text color="blueBright">❯ </Text> : <Text> </Text>);

  return (
    <Box flexDirection="column">
      <SelectInput
        items={items}
        onSelect={onSelect}
        itemComponent={CustomItem}
        indicatorComponent={CustomIndicator}
        limit={9}
      />
      <Box marginTop={1}>
        <Text dimColor>Use ↑↓ to select, press Enter to confirm</Text>
      </Box>
    </Box>
  );
};

// ─── Two‑step custom form ──────────────────────────────
const CustomFields: React.FC<{
  baseUrl: string;
  apiKey: string;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}> = ({
  baseUrl,
  apiKey,
  onBaseUrlChange,
  onApiKeyChange,
  onSubmit,
  onBack,
}) => {
    const [step, setStep] = useState<'base' | 'api'>('base');

    useInput((_, key) => {
      if (key.escape) {
        if (step === 'api') {
          setStep('base');
        } else {
          onBack();
        }
      }
    });

    const handleSubmitField = () => {
      if (step === 'base') {
        setStep('api');
      } else {
        onSubmit();
      }
    };

    const isBaseStep = step === 'base';

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold color="blueBright">
          {isBaseStep ? '◉-◎-> Enter Base URL' : '◉-◉-> Enter API Key'}
        </Text>

        {isBaseStep ? (
          <Box>
            <Box width={12}>
              <Text>Base URL:</Text>
            </Box>
            <TextInput
              value={baseUrl}
              onChange={onBaseUrlChange}
              onSubmit={handleSubmitField}
              placeholder="http://localhost:11434"
            />
          </Box>
        ) : (
          <Box>
            <Box width={12}>
              <Text>API Key:</Text>
            </Box>
            <TextInput
              value={apiKey}
              onChange={onApiKeyChange}
              onSubmit={handleSubmitField}
              placeholder="sk-..."
              mask="*"
            />
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>
            {isBaseStep
              ? 'Type your Base URL, press Enter to continue (Esc to go back)'
              : 'Type your API Key, press Enter to confirm (Esc to go back)'}
          </Text>
        </Box>
      </Box>
    );
  };

// ─── Main Provider ────────────────────────────────────
export const Provider = () => {
  const { setConfig } = useConfig();

  const items: Item[] = [
    {
      label: 'Ollama',
      value: 'ollama',
      base_url: 'http://localhost:11434',
      api_key: 'potato', // dummy, not used for Ollama
    },
    {
      label: 'LM Studio',
      value: 'lms',
      base_url: 'http://localhost:1234',
      api_key: 'potato', // dummy
    },
    {
      label: 'Custom (OpenAI Compatible)',
      value: 'custom',
      base_url: null,
      api_key: null,
    },
  ];

  const [step, setStep] = useState<'select' | 'custom'>('select');
  const [selectedProvider, setSelectedProvider] = useState<Item | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  const handleSelectProvider = (item: Item) => {
    if (item.value === 'custom') {
      setSelectedProvider(item);
      setBaseUrl('');
      setApiKey('');
      setStep('custom');
    } else {
      // Preset provider: use built‑in values and immediately save
      const url = item.base_url || '';
      const key = item.api_key || '';
      const finalProvider = { ...item, base_url: url, api_key: key };
      // Save provider with null model – Chat will handle model selection
      setConfig(finalProvider, "", null);
    }
  };

  const handleCustomSubmit = () => {
    if (selectedProvider) {
      const finalProvider = {
        ...selectedProvider,
        base_url: baseUrl,
        api_key: apiKey,
      };
      setConfig(finalProvider, "", null);
    }
  };

  const handleCustomBack = () => {
    setStep('select');
  };

  return (
    <Box paddingX={1} flexDirection="column" gap={1}>
      <Text bold>✨ Provider:</Text>
      <Box paddingX={1}>
        {step === 'select' && (
          <SelectProvider items={items} onSelect={handleSelectProvider} />
        )}

        {step === 'custom' && (
          <CustomFields
            baseUrl={baseUrl}
            apiKey={apiKey}
            onBaseUrlChange={setBaseUrl}
            onApiKeyChange={setApiKey}
            onSubmit={handleCustomSubmit}
            onBack={handleCustomBack}
          />
        )}
      </Box>
    </Box>
  );
};