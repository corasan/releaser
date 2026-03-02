import { Box, Text, useApp } from 'ink'
import React, { useCallback, useState } from 'react'
import { AIPhase } from './components/ai-phase.js'
import { ConfirmPhase } from './components/confirm-phase.js'
import { DetectedBadge, DetectPhase } from './components/detect-phase.js'
import {
  CancelledPhase,
  DonePhase,
  ErrorPhase,
} from './components/done-phase.js'
import { Header } from './components/header.js'
import { ReleasePhase } from './components/release-phase.js'
import { VersionSelect } from './components/version-select.js'
import { getPipelineSteps } from './lib/pipelines/index.js'
import type {
  Bump,
  PipelineStep,
  ProjectInfo,
  ReleaseConfig,
  ReleaseContext,
} from './lib/types.js'
import { bumpVersion } from './lib/version.js'

type Phase =
  | 'detect'
  | 'version'
  | 'ai'
  | 'confirm'
  | 'release'
  | 'done'
  | 'error'
  | 'cancelled'

export function App() {
  const { exit } = useApp()

  const [phase, setPhase] = useState<Phase>('detect')
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [config, setConfig] = useState<ReleaseConfig>({})
  const [bump, setBump] = useState<Bump | null>(null)
  const [changelog, setChangelog] = useState<string | null>(null)
  const [error, setError] = useState<string>('')
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([])
  const [ctx, setCtx] = useState<ReleaseContext | null>(null)

  const cwd = process.cwd()

  const handleDetected = useCallback(
    (proj: ProjectInfo, conf: ReleaseConfig) => {
      setProject(proj)
      setConfig(conf)
      setPhase('version')
    },
    [],
  )

  const handleDetectError = useCallback(
    (msg: string) => {
      setError(msg)
      setPhase('error')
      setTimeout(() => exit(), 100)
    },
    [exit],
  )

  const handleVersionSelect = useCallback(
    (selectedBump: Bump) => {
      setBump(selectedBump)

      if (config.ai?.changelog) {
        setPhase('ai')
      } else {
        // Skip AI, go to confirm
        const newVersion = bumpVersion(project!.version, selectedBump)
        const releaseCtx: ReleaseContext = {
          project: project!,
          bump: selectedBump,
          newVersion,
          tag: `v${newVersion}`,
          config,
          changelog: undefined,
        }
        const steps = getPipelineSteps(releaseCtx)
        setPipelineSteps(steps)
        setCtx(releaseCtx)
        setPhase('confirm')
      }
    },
    [project, config],
  )

  const handleAIResult = useCallback(
    (generatedChangelog: string | null) => {
      setChangelog(generatedChangelog)
      const newVersion = bumpVersion(project!.version, bump!)
      const releaseCtx: ReleaseContext = {
        project: project!,
        bump: bump!,
        newVersion,
        tag: `v${newVersion}`,
        config,
        changelog: generatedChangelog || undefined,
      }
      const steps = getPipelineSteps(releaseCtx)
      setPipelineSteps(steps)
      setCtx(releaseCtx)
      setPhase('confirm')
    },
    [project, bump, config],
  )

  const handleAISkip = useCallback(() => {
    handleAIResult(null)
  }, [handleAIResult])

  const handleConfirm = useCallback(() => {
    setPhase('release')
  }, [])

  const handleCancel = useCallback(() => {
    setPhase('cancelled')
    setTimeout(() => exit(), 100)
  }, [exit])

  const handleReleaseDone = useCallback(() => {
    setPhase('done')
    setTimeout(() => exit(), 100)
  }, [exit])

  const handleReleaseError = useCallback(
    (msg: string) => {
      setError(msg)
      setPhase('error')
      setTimeout(() => exit(), 100)
    },
    [exit],
  )

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header />

      {/* Show completed phase badges */}
      {project && phase !== 'detect' && (
        <Box marginBottom={1} flexDirection="column">
          <DetectedBadge project={project} />
          {bump && phase !== 'version' && (
            <Box gap={1}>
              <Text color="green">✔</Text>
              <Text>
                Version bump:{' '}
                <Text color="cyan" bold>
                  {bump}
                </Text>
                <Text dimColor>
                  {' '}
                  ({project.version} → {bumpVersion(project.version, bump)})
                </Text>
              </Text>
            </Box>
          )}
          {changelog && phase !== 'ai' && (
            <Box gap={1}>
              <Text color="green">✔</Text>
              <Text>
                Changelog: <Text color="magenta">AI generated</Text>
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Current phase */}
      <Box flexDirection="column">
        {phase === 'detect' && (
          <DetectPhase
            cwd={cwd}
            onDetected={handleDetected}
            onError={handleDetectError}
          />
        )}
        {phase === 'version' && project && (
          <VersionSelect project={project} onSelect={handleVersionSelect} />
        )}
        {phase === 'ai' && (
          <AIPhase onResult={handleAIResult} onSkip={handleAISkip} />
        )}
        {phase === 'confirm' && ctx && (
          <ConfirmPhase
            ctx={ctx}
            steps={pipelineSteps}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        )}
        {phase === 'release' && ctx && (
          <ReleasePhase
            ctx={ctx}
            pipelineSteps={pipelineSteps}
            onDone={handleReleaseDone}
            onError={handleReleaseError}
          />
        )}
        {phase === 'done' && ctx && <DonePhase ctx={ctx} />}
        {phase === 'error' && <ErrorPhase error={error} />}
        {phase === 'cancelled' && <CancelledPhase />}
      </Box>
    </Box>
  )
}
