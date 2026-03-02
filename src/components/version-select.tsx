import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import type { Bump, ProjectInfo } from '../lib/types.js'
import { previewVersions } from '../lib/version.js'

interface VersionSelectProps {
  project: ProjectInfo
  aiSuggestion?: { bump: string; reason: string } | null
  onSelect: (bump: Bump) => void
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

function VersionItem({
  isSelected,
  label,
}: {
  isSelected?: boolean
  label: string
}) {
  return (
    <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
      {label}
    </Text>
  )
}

export function VersionSelect({
  project,
  aiSuggestion,
  onSelect,
}: VersionSelectProps) {
  const versions = previewVersions(project.version)

  const items = (['patch', 'minor', 'major'] as const).map(bump => ({
    key: bump,
    label: `${bump.padEnd(6)} ${project.version} → ${versions[bump]}`,
    value: bump,
  }))

  return (
    <Box flexDirection="column">
      {aiSuggestion && (
        <Box marginBottom={1} gap={1}>
          <Text color="magenta">⚡</Text>
          <Text>
            AI suggests{' '}
            <Text color="magenta" bold>
              {aiSuggestion.bump}
            </Text>
            <Text dimColor> — {aiSuggestion.reason}</Text>
          </Text>
        </Box>
      )}
      <Box marginBottom={1}>
        <Text bold>Select version bump:</Text>
      </Box>
      <SelectInput
        items={items}
        onSelect={item => onSelect(item.value as Bump)}
        indicatorComponent={Indicator}
        itemComponent={VersionItem}
      />
    </Box>
  )
}
