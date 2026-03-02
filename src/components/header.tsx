import React from 'react'
import { Box, Text } from 'ink'

export function Header() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>
        {'  ╔══════════════════════════════════╗'}
      </Text>
      <Box>
        <Text color="cyan" bold>
          {'  ║ '}
        </Text>
        <Text color="magentaBright" bold>
          {'⚡'}
        </Text>
        <Text color="white" bold>
          {' Releaser'}
        </Text>
        <Text dimColor> v0.1.0</Text>
        <Text color="cyan" bold>
          {'              ║'}
        </Text>
      </Box>
      <Text color="cyan" bold>
        {'  ╚══════════════════════════════════╝'}
      </Text>
    </Box>
  )
}
