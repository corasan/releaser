import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { useEffect, useState } from 'react'
import { detectEnv, detectProject, getProjectTypeLabel } from '../lib/detect.js'
import { hasUncommittedChanges, isGitRepo } from '../lib/git.js'
import { readProjectConfig } from '../lib/project-config.js'
import type {
  DetectedEnv,
  ParsedProjectConfig,
  ProjectInfo,
} from '../lib/types.js'

interface DetectPhaseProps {
  cwd: string
  onDetected: (
    project: ProjectInfo,
    env: DetectedEnv,
    config: ParsedProjectConfig,
  ) => void
  onError: (message: string) => void
}

export function DetectPhase({ cwd, onDetected, onError }: DetectPhaseProps) {
  const [message, setMessage] = useState('Detecting project...')

  useEffect(() => {
    async function detect() {
      const isGit = await isGitRepo()
      if (!isGit) {
        onError('Not a git repository. Run releaser from a git project.')
        return
      }

      const dirty = await hasUncommittedChanges()
      if (dirty) {
        onError(
          'Uncommitted changes detected. Commit or stash before releasing.',
        )
        return
      }

      setMessage('Analyzing project...')

      const project = await detectProject(cwd)

      if (project.type === 'unknown') {
        onError(
          'Could not detect project type. Supported: npm, Expo, Tauri, macOS.',
        )
        return
      }

      // Read config files + detect environment in parallel
      const [env, config] = await Promise.all([
        detectEnv(cwd),
        readProjectConfig(project),
      ])

      setTimeout(() => onDetected(project, env, config), 500)
    }

    detect().catch(err => {
      onError(err instanceof Error ? err.message : String(err))
    })
  }, [cwd, onDetected, onError])

  return (
    <Box gap={1}>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      <Text>{message}</Text>
    </Box>
  )
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
