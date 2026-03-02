import React from 'react'
import { Box, Text } from 'ink'
import type { ReleaseContext } from '../lib/types.js'
import { getProjectTypeLabel } from '../lib/detect.js'

interface DonePhaseProps {
  ctx: ReleaseContext
}

export function DonePhase({ ctx }: DonePhaseProps) {
  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="green"
        paddingX={2}
        paddingY={1}
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
