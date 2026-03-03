import { Box, Text } from 'ink'
import { useState } from 'react'
import SelectInput from 'ink-select-input'
import type { Bump, PreReleaseChannel, ProjectInfo } from '../lib/types.js'
import {
  bumpPreRelease,
  bumpToStable,
  getPreReleaseBumpItems,
  isPreRelease,
  parseVersion,
  previewVersions,
} from '../lib/version.js'

interface VersionSelectProps {
  project: ProjectInfo
  aiSuggestion?: { bump: string; reason: string } | null
  onSelect: (bump: Bump, newVersion: string, preRelease?: PreReleaseChannel) => void
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

type Step = 'release-type' | 'stable-bump' | 'pre-release-bump' | 'pre-release-channel'

export function VersionSelect({
  project,
  aiSuggestion,
  onSelect,
}: VersionSelectProps) {
  const currentIsPreRelease = isPreRelease(project.version)
  const [step, setStep] = useState<Step>('release-type')
  const [baseBump, setBaseBump] = useState<Bump | null>(null)

  // ── Pre-release version: simplified menu ──
  if (currentIsPreRelease) {
    const channel = parseVersion(project.version).preRelease!.channel
    const items = getPreReleaseBumpItems(project.version)

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>How do you want to release?</Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={item => {
            if (item.value === 'bump-pre') {
              const newVer = bumpPreRelease(project.version, null, channel)
              onSelect('patch', newVer, channel)
            } else if (item.value === 'stable') {
              onSelect('patch', bumpToStable(project.version))
            } else {
              const ch = item.value as PreReleaseChannel
              const newVer = bumpPreRelease(project.version, null, ch)
              onSelect('patch', newVer, ch)
            }
          }}
          indicatorComponent={Indicator}
          itemComponent={VersionItem}
        />
      </Box>
    )
  }

  // ── Stable version: multi-step menu ──

  const versions = previewVersions(project.version)

  // Step 1: Stable or Pre-release?
  if (step === 'release-type') {
    const items = [
      { key: 'stable', label: 'Stable', value: 'stable' },
      { key: 'pre-release', label: 'Pre-release', value: 'pre-release' },
    ]
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
          <Text bold>How do you want to release?</Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={item => {
            if (item.value === 'stable') setStep('stable-bump')
            else setStep('pre-release-bump')
          }}
          indicatorComponent={Indicator}
          itemComponent={VersionItem}
        />
      </Box>
    )
  }

  // Step 2a: Stable bump selection (patch/minor/major)
  if (step === 'stable-bump') {
    const items = (['patch', 'minor', 'major'] as const).map(bump => ({
      key: bump,
      label: `${bump.padEnd(6)} ${project.version} → ${versions[bump]}`,
      value: bump,
    }))

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Select version bump:</Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={item => onSelect(item.value as Bump, versions[item.value as Bump])}
          indicatorComponent={Indicator}
          itemComponent={VersionItem}
        />
      </Box>
    )
  }

  // Step 2b: Pre-release base bump (patch/minor/major)
  if (step === 'pre-release-bump') {
    const items = (['patch', 'minor', 'major'] as const).map(bump => ({
      key: bump,
      label: `${bump.padEnd(6)} (${versions[bump]}-*.0)`,
      value: bump,
    }))

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Which base version?</Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={item => {
            setBaseBump(item.value as Bump)
            setStep('pre-release-channel')
          }}
          indicatorComponent={Indicator}
          itemComponent={VersionItem}
        />
      </Box>
    )
  }

  // Step 3: Channel selection (alpha/beta/rc)
  if (step === 'pre-release-channel' && baseBump) {
    const baseVersion = versions[baseBump]
    const items = (['alpha', 'beta', 'rc'] as const).map(ch => ({
      key: ch,
      label: `${ch.padEnd(6)} ${baseVersion}-${ch}.0`,
      value: ch,
    }))

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Which channel?</Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={item => {
            const ch = item.value as PreReleaseChannel
            const newVer = `${baseVersion}-${ch}.0`
            onSelect(baseBump, newVer, ch)
          }}
          indicatorComponent={Indicator}
          itemComponent={VersionItem}
        />
      </Box>
    )
  }

  return null
}
