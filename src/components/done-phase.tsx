import { Box, Text } from 'ink'
import { getProjectTypeLabel } from '../lib/detect.js'
import type { ReleaseContext } from '../lib/types.js'

interface DonePhaseProps {
  ctx: ReleaseContext
  releaseUrl?: string
}

export function DonePhase({ ctx, releaseUrl }: DonePhaseProps) {
  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="green"
        paddingX={2}
        paddingY={1}
        alignSelf="flex-start"
      >
        <Box gap={1}>
          <Text color="green" bold>
            ✔ Release {ctx.tag} complete!
          </Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Box gap={1}>
            <Text dimColor>Package:</Text>
            <Text>{ctx.project.name}</Text>
          </Box>
          <Box gap={1}>
            <Text dimColor>Type:</Text>
            <Text>{getProjectTypeLabel(ctx.project.type)}</Text>
          </Box>
          <Box gap={1}>
            <Text dimColor>Version:</Text>
            <Text color="green" bold>
              {ctx.newVersion}
            </Text>
          </Box>
          {releaseUrl && (
            <Box gap={1}>
              <Text dimColor>Release:</Text>
              <Text color="cyan">{releaseUrl}</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}

export function ErrorPhase({ error }: { error: string }) {
  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="red"
        paddingX={2}
        paddingY={1}
      >
        <Box gap={1}>
          <Text color="red" bold>
            ✖ Release failed
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      </Box>
    </Box>
  )
}

export function CancelledPhase() {
  return (
    <Box>
      <Text dimColor>Release cancelled.</Text>
    </Box>
  )
}
