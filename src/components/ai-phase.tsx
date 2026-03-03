import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import Spinner from 'ink-spinner'
import { useEffect, useState } from 'react'
import { generateChangelogWithAI, isAIAvailable } from '../lib/ai.js'
import { writeReleaserConfig } from '../lib/config.js'
import { getCommitsSinceLastTag } from '../lib/git.js'
import type { ReleaserConfig } from '../lib/types.js'

interface AIPhaseProps {
  onResult: (changelog: string | null) => void
  onSkip: () => void
  releaserConfig: ReleaserConfig | null
  cwd: string
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

function Item({ isSelected, label }: { isSelected?: boolean; label: string }) {
  return (
    <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
      {label}
    </Text>
  )
}

export function AIPhase({ onResult, onSkip, releaserConfig, cwd }: AIPhaseProps) {
  const [state, setState] = useState<
    'checking' | 'ask' | 'ask-changelog' | 'generating' | 'unavailable'
  >('checking')
  const [commits, setCommits] = useState<string[]>([])
  const [hasChangelogFile, setHasChangelogFile] = useState(false)

  useEffect(() => {
    async function check() {
      const [available, recentCommits, changelogExists] = await Promise.all([
        isAIAvailable(),
        getCommitsSinceLastTag(),
        Bun.file(`${cwd}/CHANGELOG.md`).exists(),
      ])
      setCommits(recentCommits)
      setHasChangelogFile(changelogExists)

      if (!available || recentCommits.length === 0) {
        setState('unavailable')
        // Auto-skip after brief display
        setTimeout(() => onSkip(), 500)
        return
      }

      setState('ask')
    }

    check()
  }, [onSkip, cwd])

  if (state === 'checking') {
    return (
      <Box gap={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text>Checking AI availability...</Text>
      </Box>
    )
  }

  if (state === 'unavailable') {
    return (
      <Box gap={1}>
        <Text dimColor>⊘</Text>
        <Text dimColor>AI changelog not available (skipping)</Text>
      </Box>
    )
  }

  if (state === 'generating') {
    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text color="magenta">
            <Spinner type="dots" />
          </Text>
          <Text>
            Generating changelog with AI{' '}
            <Text dimColor>({commits.length} commits)</Text>...
          </Text>
        </Box>
      </Box>
    )
  }

  if (state === 'ask-changelog') {
    const items = [
      { key: 'yes', label: 'Yes, create CHANGELOG.md', value: true },
      { key: 'no', label: 'No, skip CHANGELOG.md', value: false },
    ]

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Create CHANGELOG.md for future releases?</Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={item => {
            if (item.value) {
              const updated = { ...releaserConfig, changelog: true }
              writeReleaserConfig(cwd, updated)
            }
            setState('generating')
            generateChangelogWithAI(commits).then(changelog => {
              onResult(changelog)
            })
          }}
          indicatorComponent={Indicator}
          itemComponent={Item}
        />
      </Box>
    )
  }

  // state === 'ask'
  const items = [
    {
      key: 'yes',
      label: `Yes, generate from ${commits.length} commits`,
      value: true,
    },
    { key: 'no', label: 'No, skip changelog', value: false },
  ]

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Generate changelog with AI?</Text>
      </Box>
      <SelectInput
        items={items}
        onSelect={item => {
          if (item.value) {
            // If CHANGELOG.md doesn't exist and config hasn't explicitly set changelog
            if (!hasChangelogFile && releaserConfig?.changelog === undefined) {
              setState('ask-changelog')
              return
            }
            setState('generating')
            generateChangelogWithAI(commits).then(changelog => {
              onResult(changelog)
            })
          } else {
            onSkip()
          }
        }}
        indicatorComponent={Indicator}
        itemComponent={Item}
      />
    </Box>
  )
}
