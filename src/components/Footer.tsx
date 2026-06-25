import React from 'react'
import { Box, Text } from 'ink'
import { useConfig, pwd, isCurrentDirectoryHome } from '../context/ConfigContext';


function Footer() {
    const { provider, model, resetConfig, setConfig } = useConfig();
    return (
        <Box flexDirection="column" borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderDimColor>
            <Box
                flexDirection="row"
                justifyContent="flex-start"
                gap={3}
                width="100%"
            >
                <Box flexDirection="column">
                    <Text dimColor>Workspace</Text>
                    <Text dimColor>{isCurrentDirectoryHome() ? "~/" : pwd}</Text>
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
                    <Text dimColor>{0}</Text>
                </Box>
            </Box>
        </Box>
    )
}

export default Footer
