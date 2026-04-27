import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import { getProjectTypeLabel } from '../lib/detect.js'
import type { PipelineStep, ReleaseContext } from '../lib/types.js'

interface ConfirmPhaseProps {
  ctx: ReleaseContext
  steps: PipelineStep[]
  onConfirm: () => void
  onCancel: () => void
}

function Indicator({ isSelected }: { isSelected?: boolean }) {
  return (
    <Box marginRight={1}>
      <Text color={isSelected ? 'cyan' : undefined}>
        {isSelected ? '▸' : ' '}
      </Text>
    </Box>
  )
}

function ConfirmItem({
  isSelected,
  label,
}: {
  isSelected?: boolean
  label: string
}) {
  return (
    <Text
      color={isSelected ? (label.startsWith('Yes') ? 'green' : 'red') : 'white'}
      bold={isSelected}
    >
      {label}
    </Text>
  )
}

export function ConfirmPhase({
  ctx,
  steps,
  onConfirm,
  onCancel,
}: ConfirmPhaseProps) {
  const items = [
    { key: 'yes', label: 'Yes, release!', value: true },
    { key: 'no', label: 'No, cancel', value: false },
  ]

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={2}
        paddingY={1}
        marginBottom={1}
      >
        <Text bold color="yellow">
          Release Summary
        </Text>
        <Box marginTop={1} flexDirection="column" gap={0}>
          <Box gap={1}>
            <Text dimColor>Project:</Text>
            <Text bold>{ctx.project.name}</Text>
            <Text dimColor>({getProjectTypeLabel(ctx.project.type)})</Text>
          </Box>
          <Box gap={1}>
            <Text dimColor>Version:</Text>
            <Text>
              {ctx.project.version} →{' '}
              <Text color="green" bold>
                {ctx.newVersion}
              </Text>
            </Text>
          </Box>
          <Box gap={1}>
            <Text dimColor>Tag:</Text>
            <Text>{ctx.tag}</Text>
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text dimColor bold>
            Steps:
          </Text>
          {steps
            .filter(s => !s.skip?.(ctx))
            .map((step, i) => (
              <Box key={step.id} gap={1} marginLeft={1}>
                <Text dimColor>{i + 1}.</Text>
                <Text>{step.label}</Text>
              </Box>
            ))}
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text bold>
          Confirm release <Text color="green">{ctx.tag}</Text>?
        </Text>
      </Box>
      <SelectInput
        items={items}
        onSelect={item => {
          if (item.value) onConfirm()
          else onCancel()
        }}
        indicatorComponent={Indicator}
        itemComponent={ConfirmItem}
      />
    </Box>
  )
}
