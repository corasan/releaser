import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { detectProject, getProjectTypeLabel } from '../lib/detect.js'
import { loadConfig } from '../lib/config.js'
import { hasUncommittedChanges, isGitRepo } from '../lib/git.js'
import type { ProjectInfo, ReleaseConfig } from '../lib/types.js'

interface DetectPhaseProps {
  cwd: string
  onDetected: (project: ProjectInfo, config: ReleaseConfig) => void
  onError: (message: string) => void
}

type DetectState = 'checking' | 'done' | 'error'

export function DetectPhase({ cwd, onDetected, onError }: DetectPhaseProps) {
  const [state, setState] = useState<DetectState>('checking')
  const [message, setMessage] = useState('Detecting project type...')

  useEffect(() => {
    async function detect() {
      // Check if we're in a git repo
      const isGit = await isGitRepo()
      if (!isGit) {
        onError('Not a git repository. Please run releaser from a git project.')
        return
      }

      // Check for uncommitted changes
      const dirty = await hasUncommittedChanges()
      if (dirty) {
        onError('You have uncommitted changes. Please commit or stash them before releasing.')
        return
      }

      setMessage('Analyzing project...')

      const [project, config] = await Promise.all([
        detectProject(cwd),
        loadConfig(cwd),
      ])

      if (project.type === 'unknown') {
        onError(
          'Could not detect project type. Create a releaser.config.ts to configure manually.',
        )
        return
      }

      setState('done')
      // Small delay so the user sees the detection result
      setTimeout(() => onDetected(project, config), 500)
    }

    detect().catch((err) => {
      onError(err instanceof Error ? err.message : String(err))
    })
  }, [cwd])

  if (state === 'checking') {
    return (
      <Box gap={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text>{message}</Text>
      </Box>
    )
  }

  return null
}

export function DetectedBadge({ project }: { project: ProjectInfo }) {
  return (
    <Box gap={1}>
      <Text color="green">✔</Text>
      <Text>
        Detected:{' '}
        <Text color="cyan" bold>
          {getProjectTypeLabel(project.type)}
        </Text>
        <Text dimColor>
          {' '}
          — {project.name} (v{project.version})
        </Text>
      </Text>
    </Box>
  )
}
