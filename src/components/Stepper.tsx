import React from 'react';
import { Text, Box } from 'ink';

export const StepperWIP: React.FC  = () => {
  const steps = ['Theme', 'Directory', 'Review'];
  const currentStep = 0; // or useState

  return (
    <Box width="100%" flexDirection="column" borderStyle="round">
      {/* Custom line */}
      <Box width="100%" flexDirection="row" justifyContent="space-between">
        {steps.map((name, i) => (
          <Box key={i} flexDirection="column" alignItems="center">
            <Text>{i === currentStep ? '●' : '○'}</Text>
            <Text>{name}</Text>
          </Box>
        ))}
        <Box flexGrow={1} justifyContent="space-between">
          {/* You can draw dashes here */}
        </Box>
      </Box>
      {/* Step content below */}
    </Box>
  );
};