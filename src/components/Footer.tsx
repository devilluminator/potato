import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useConfig, pwd, isCurrentDirectoryHome, MCP_CONFIG_PATH } from '../context/ConfigContext';

function Footer() {
    const { model, locked } = useConfig();
    const [mcpLength, setMcpLength] = useState(0);

    useEffect(() => {
        Bun.file(MCP_CONFIG_PATH)
            .json()
            .then((mcp) => {
                // Count servers inside mcpServers
                const count = Object.keys(mcp.mcpServers || {}).length;
                setMcpLength(count);
            })
            .catch(() => setMcpLength(0)); // fallback if file doesn't exist
    }, []);

    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderTop
            borderBottom={false}
            borderLeft={false}
            borderRight={false}
            borderDimColor
        >
            <Box
                flexDirection="row"
                justifyContent="flex-start"
                gap={3}
                width="100%"
            >
                <Box flexDirection="column">
                    <Text dimColor>Workspace</Text>
                    <Text dimColor>{isCurrentDirectoryHome() ? '~/' : pwd}</Text>
                </Box>
                {/* <Box flexDirection="column">
          <Text dimColor>Locked</Text>
          <Text dimColor>False</Text>
        </Box> */}
                <Box flexDirection="column">
                    <Text dimColor>Model</Text>
                    <Text dimColor>{model}</Text>
                </Box>
                <Box flexDirection="column">
                    <Text dimColor>Docs</Text>
                    <Text dimColor>0</Text>
                </Box>
                <Box flexDirection="column">
                    <Text dimColor>MCP</Text>
                    <Text dimColor>{mcpLength}</Text>
                </Box>
                <Box flexDirection="column">
                    <Text dimColor>Locked</Text>
                    <Text dimColor>{locked ? 'True' : 'False'}</Text>
                </Box>
            </Box>
        </Box>
    );
}

export default Footer;