import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import Spinner from 'ink-spinner'
import { useEffect, useState } from 'react'
import { generateChangelogWithAI, isAIAvailable } from '../lib/ai.js'
import { writeReleaserConfig } from '../lib/config.js'
import {
  getCommitsSinceLastTag,
  getCommitsSinceLastTagForPath,
  getLastTag,
} from '../lib/git.js'
import type { PackageBump, ReleaserConfig } from '../lib/types.js'

interface AIPhaseProps {
  onResult: (
    changelog: string | null,
    packageChangelogs?: Record<string, string>,
  ) => void
  onSkip: () => void
  releaserConfig: ReleaserConfig | null
  cwd: string
  packageBumps?: PackageBump[]
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

export function AIPhase({ onResult, onSkip, releaserConfig, cwd, packageBumps }: AIPhaseProps) {
  const [state, setState] = useState<
    'checking' | 'ask' | 'ask-changelog' | 'generating' | 'unavailable'
  >('checking')
  const [commits, setCommits] = useState<string[]>([])
  const [hasChangelogFile, setHasChangelogFile] = useState(false)

  async function generateChangelogs(
    globalCommits: string[],
  ): Promise<[string | null, Record<string, string> | undefined]> {
    if (!packageBumps || packageBumps.length === 0) {
      return [await generateChangelogWithAI(globalCommits), undefined]
    }
    const lastTag = await getLastTag()
    const pkgChangelogs: Record<string, string> = {}
    const [globalChangelog] = await Promise.all([
      generateChangelogWithAI(globalCommits),
      ...packageBumps.map(async b => {
        const pkgCommits = await getCommitsSinceLastTagForPath(b.relativePath, lastTag)
        if (pkgCommits.length > 0) {
          const cl = await generateChangelogWithAI(pkgCommits)
          if (cl) pkgChangelogs[b.relativePath] = cl
        }
      }),
    ])
    return [globalChangelog, Object.keys(pkgChangelogs).length > 0 ? pkgChangelogs : undefined]
  }

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
            generateChangelogs(commits).then(([changelog, pkgChangelogs]) => {
              onResult(changelog, pkgChangelogs)
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
            generateChangelogs(commits).then(([changelog, pkgChangelogs]) => {
              onResult(changelog, pkgChangelogs)
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
