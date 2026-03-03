import { Box, Text } from 'ink'
import pckg from '../../package.json'

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
        <Text dimColor> v${pckg.version}</Text>
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
