import { Box, Text, useApp } from 'ink'
import { useCallback, useEffect, useState } from 'react'
import { AIPhase } from './components/ai-phase.js'
import { ConfirmPhase } from './components/confirm-phase.js'
import { DetectedBadge, DetectPhase } from './components/detect-phase.js'
import {
  CancelledPhase,
  DonePhase,
  ErrorPhase,
} from './components/done-phase.js'
import { DynamicOptions } from './components/dynamic-options.js'
import { Header } from './components/header.js'
import { ReleasePhase } from './components/release-phase.js'
import { VersionSelect } from './components/version-select.js'
import { PackageSelect } from './components/package-select.js'
import { InitPhase } from './components/init-phase.js'
import { parseReleaserConfig } from './lib/config.js'
import { getPipelineSteps } from './lib/pipelines/index.js'
import type {
  Answers,
  Bump,
  DetectedEnv,
  PackageBump,
  ParsedProjectConfig,
  PipelineStep,
  ProjectInfo,
  ReleaseContext,
  ReleaserConfig,
} from './lib/types.js'
import { bumpVersion } from './lib/version.js'
import {
  detectWorkspaces,
  resolveWorkspacePackages,
  type WorkspacePackage,
} from './lib/workspace.js'

type Phase =
  | 'detect'
  | 'init'
  | 'package-select'
  | 'version'
  | 'options'
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
  const [env, setEnv] = useState<DetectedEnv>({
    hasBuildScript: false,
    hasTestScript: false,
    hasGhCli: false,
    hasEasCli: false,
  })
  const [projectConfig, setProjectConfig] = useState<ParsedProjectConfig>({
    options: [],
    data: {},
  })
  const [bump, setBump] = useState<Bump | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [changelog, setChangelog] = useState<string | null>(null)
  const [releaserConfig, setReleaserConfig] = useState<ReleaserConfig | null>(null)
  const [error, setError] = useState<string>('')
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([])
  const [ctx, setCtx] = useState<ReleaseContext | null>(null)
  const [workspacePackages, setWorkspacePackages] = useState<WorkspacePackage[]>([])
  const [packageBumps, setPackageBumps] = useState<PackageBump[]>([])

  const cwd = process.cwd()

  const handleDetected = useCallback(
    async (
      proj: ProjectInfo,
      detectedEnv: DetectedEnv,
      config: ParsedProjectConfig,
    ) => {
      setProject(proj)
      setEnv(detectedEnv)
      setProjectConfig(config)

      // Check for monorepo init flow
      const rc = await parseReleaserConfig(cwd)
      setReleaserConfig(rc)

      if (!rc) {
        const ws = await detectWorkspaces(cwd)
        if (ws) {
          const pkgs = await resolveWorkspacePackages(cwd, ws.patterns)
          setWorkspacePackages(pkgs)
          setPhase('init')
          return
        }
      }

      if (rc?.versioning === 'independent' && rc.packages) {
        setPhase('package-select')
        return
      }

      setPhase('version')
    },
    [cwd],
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

      // If project config produced dynamic options, show them
      if (projectConfig.options.length > 0) {
        setPhase('options')
      } else {
        // No options needed (npm, etc.) — go straight to AI
        setPhase('ai')
      }
    },
    [projectConfig],
  )

  const handleOptionsComplete = useCallback((selectedAnswers: Answers) => {
    setAnswers(selectedAnswers)
    setPhase('ai')
  }, [])

  // Build release context and advance to confirm
  const buildContextAndConfirm = useCallback(
    (finalChangelog: string | null, finalAnswers: Answers) => {
      setChangelog(finalChangelog)
      const isIndependent = packageBumps.length > 0 && releaserConfig?.versioning === 'independent'
      const effectiveBump = isIndependent ? packageBumps[0].bump : bump!
      const effectiveVersion = isIndependent ? packageBumps[0].newVersion : bumpVersion(project!.version, bump!)
      const releaseCtx: ReleaseContext = {
        project: project!,
        bump: effectiveBump,
        newVersion: effectiveVersion,
        tag: isIndependent ? packageBumps.map(b => `${b.name}@${b.newVersion}`).join(', ') : `v${effectiveVersion}`,
        env,
        answers: finalAnswers,
        projectConfig,
        releaserConfig,
        changelog: finalChangelog || undefined,
        packageBumps: isIndependent ? packageBumps : undefined,
      }
      const steps = getPipelineSteps(releaseCtx)
      setPipelineSteps(steps)
      setCtx(releaseCtx)
      setPhase('confirm')
    },
    [project, bump, env, projectConfig, releaserConfig, packageBumps],
  )

  const handleAIResult = useCallback(
    (generatedChangelog: string | null) => {
      buildContextAndConfirm(generatedChangelog, answers)
    },
    [answers, buildContextAndConfirm],
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
      {project && phase !== 'detect' && phase !== 'init' && (
        <Box marginBottom={1} flexDirection="column">
          <DetectedBadge project={project} releaserConfig={releaserConfig} />
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
        {phase === 'init' && workspacePackages.length > 0 && (
          <InitPhase
            cwd={cwd}
            packages={workspacePackages}
            onComplete={(config) => {
              setReleaserConfig(config)
              if (config.versioning === 'independent' && config.packages) {
                setPhase('package-select')
              } else {
                setPhase('version')
              }
            }}
            onSkip={() => setPhase('version')}
          />
        )}
        {phase === 'package-select' && releaserConfig?.packages && (
          <PackageSelect
            packages={Object.entries(releaserConfig.packages)
              .filter(([, config]) => config.bump)
              .map(([relativePath]) => {
                const wp = workspacePackages.find(p => p.relativePath === relativePath)
                return {
                  relativePath,
                  name: wp?.name || relativePath,
                  version: wp?.version || project?.version || '0.0.0',
                }
              })}
            onComplete={(selectedBumps) => {
              setPackageBumps(selectedBumps)
              if (projectConfig.options.length > 0) {
                setPhase('options')
              } else {
                setPhase('ai')
              }
            }}
            onCancel={handleCancel}
          />
        )}
        {phase === 'version' && project && (
          <VersionSelect project={project} onSelect={handleVersionSelect} />
        )}
        {phase === 'options' && projectConfig.options.length > 0 && (
          <DynamicOptions
            options={projectConfig.options}
            onComplete={handleOptionsComplete}
          />
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
