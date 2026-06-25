import { Box, Text } from "ink";
import BigText from "ink-big-text";
import Gradient from "ink-gradient";
import React from "react";

const Logo: React.FC = () => {
  return (
    <Box gap={1} borderBottom borderLeft={false} borderRight={false} borderTop={false} borderStyle={"single"} borderDimColor>
      <Gradient name="pastel">
        <BigText font="tiny" text="potato" backgroundColor="transparent" />
      </Gradient>
      <Box paddingTop={3}>
        <Text bold dimColor>v0.1.0</Text>
      </Box>
    </Box>
  );
};

export default Logo;
