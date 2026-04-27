import { Box, Text, useApp } from 'ink'
import { useCallback, useMemo, useState } from 'react'
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
import { pickVersionSourcePath } from './lib/monorepo.js'
import { getPipelineSteps } from './lib/pipelines/index.js'
import type {
  Answers,
  Bump,
  DetectedEnv,
  PackageBump,
  ParsedProjectConfig,
  PipelineStep,
  PreReleaseChannel,
  ProjectInfo,
  ReleaseContext,
  ReleaserConfig,
} from './lib/types.js'
import { bumpVersion, isPreRelease, getPreReleaseChannel, bumpPreRelease } from './lib/version.js'
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
  | 'confirm'
  | 'release'
  | 'done'
  | 'error'
  | 'cancelled'

interface AppProps {
  cliChannel?: PreReleaseChannel
  cliBump?: Bump
  cliBumpFlag?: boolean
  publishOnly?: boolean
}

export function App({ cliChannel, cliBump, cliBumpFlag, publishOnly }: AppProps) {
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
  const [newVersion, setNewVersion] = useState<string | null>(null)
  const [preRelease, setPreRelease] = useState<PreReleaseChannel | undefined>()
  const [releaserConfig, setReleaserConfig] = useState<ReleaserConfig | null>(null)
  const [error, setError] = useState<string>('')
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([])
  const [ctx, setCtx] = useState<ReleaseContext | null>(null)
  const [workspacePackages, setWorkspacePackages] = useState<WorkspacePackage[]>([])
  const [packageBumps, setPackageBumps] = useState<PackageBump[]>([])
  const [releaseUrl, setReleaseUrl] = useState<string | undefined>()

  const cwd = process.cwd()

  const selectablePackages = useMemo(() => {
    if (!releaserConfig?.packages) return []
    return Object.entries(releaserConfig.packages)
      .filter(([, config]) => config.bump)
      .map(([relativePath]) => {
        const wp = workspacePackages.find(p => p.relativePath === relativePath)
        return {
          relativePath,
          name: wp?.name || relativePath,
          version: wp?.version || '0.0.0',
        }
      })
  }, [releaserConfig, workspacePackages])

  const handleDetected = useCallback(
    async (
      proj: ProjectInfo,
      detectedEnv: DetectedEnv,
      config: ParsedProjectConfig,
    ) => {
      setEnv(detectedEnv)
      setProjectConfig(config)

      // Check for monorepo init flow
      const rc = await parseReleaserConfig(cwd)
      setReleaserConfig(rc)

      const ws = await detectWorkspaces(cwd)
      let resolvedPackages: WorkspacePackage[] = []
      if (ws) {
        resolvedPackages = await resolveWorkspacePackages(cwd, ws.patterns)
        setWorkspacePackages(resolvedPackages)
      }

      // For synchronized monorepos, the source package (not the root
      // package.json) drives the project name, version, bumps, tags, and
      // npm publish — the root is just a workspace meta-package.
      let project: ProjectInfo = proj
      if (rc?.packages && rc.versioning !== 'independent' && resolvedPackages.length > 0) {
        const sourcePath = pickVersionSourcePath(rc.packages, rc.versionSource)
        const sourcePkg = sourcePath
          ? resolvedPackages.find(p => p.relativePath === sourcePath)
          : undefined
        if (sourcePkg) {
          project = { ...proj, name: sourcePkg.name, version: sourcePkg.version }
        }
      }

      setProject(project)

      if (ws && !rc) {
        setPhase('init')
        return
      }

      if (publishOnly) {
        const currentVersion = project.version
        const channel = isPreRelease(currentVersion) ? getPreReleaseChannel(currentVersion) : undefined
        const releaseCtx: ReleaseContext = {
          project,
          bump: 'patch',
          newVersion: currentVersion,
          tag: `v${currentVersion}`,
          env: detectedEnv,
          answers: {},
          projectConfig: config,
          releaserConfig: rc,
          preRelease: channel,
        }
        const steps = getPipelineSteps(releaseCtx, true)
        setPipelineSteps(steps)
        setCtx(releaseCtx)
        setNewVersion(currentVersion)
        setPhase('release')
        return
      }

      if (rc?.versioning === 'independent' && rc.packages) {
        setPhase('package-select')
        return
      }

      // CLI flags: skip version select
      if (cliChannel || cliBumpFlag || cliBump) {
        const currentVersion = project.version
        const currentIsPreRelease = isPreRelease(currentVersion)

        let selectedBump: Bump = 'patch'
        let selectedNewVersion = currentVersion
        let selectedPreRelease: PreReleaseChannel | undefined

        if (cliBumpFlag) {
          if (!currentIsPreRelease) {
            setError('Error: --bump requires a pre-release version')
            setPhase('error')
            setTimeout(() => exit(), 100)
            return
          }
          selectedPreRelease = getPreReleaseChannel(currentVersion)!
          selectedNewVersion = bumpPreRelease(currentVersion, null, selectedPreRelease)
          selectedBump = 'patch'
        } else if (cliChannel) {
          if (!currentIsPreRelease && !cliBump) {
            setError(`Error: --${cliChannel} from stable requires --patch, --minor, or --major`)
            setPhase('error')
            setTimeout(() => exit(), 100)
            return
          }
          selectedNewVersion = bumpPreRelease(currentVersion, cliBump ?? null, cliChannel)
          selectedBump = cliBump ?? 'patch'
          selectedPreRelease = cliChannel
        } else if (cliBump) {
          selectedNewVersion = bumpVersion(currentVersion, cliBump)
          selectedBump = cliBump
        }

        setBump(selectedBump)
        setNewVersion(selectedNewVersion)
        setPreRelease(selectedPreRelease)

        if (projectConfig.options.length > 0) {
          setPhase('options')
        } else {
          buildContextAndConfirm(answers, {
            bump: selectedBump,
            newVersion: selectedNewVersion,
            preRelease: selectedPreRelease,
          })
        }
        return
      }

      setPhase('version')
    },
    [cwd, cliChannel, cliBump, cliBumpFlag, publishOnly, exit],
  )

  const handleDetectError = useCallback(
    (msg: string) => {
      setError(msg)
      setPhase('error')
      setTimeout(() => exit(), 100)
    },
    [exit],
  )

  // Build release context and advance to confirm.
  // `overrides` lets call sites pass freshly-selected values that haven't
  // yet flushed through state setters.
  const buildContextAndConfirm = useCallback(
    (
      finalAnswers: Answers,
      overrides?: {
        bump?: Bump
        newVersion?: string
        preRelease?: PreReleaseChannel
        packageBumps?: PackageBump[]
      },
    ) => {
      const finalBump = overrides?.bump ?? bump
      const finalNewVersion = overrides?.newVersion ?? newVersion
      const finalPreRelease = overrides?.preRelease ?? preRelease
      const finalPackageBumps = overrides?.packageBumps ?? packageBumps
      const isIndependent = finalPackageBumps.length > 0
      const effectiveBump = isIndependent ? finalPackageBumps[0].bump : finalBump!
      const effectiveVersion = isIndependent ? finalPackageBumps[0].newVersion : finalNewVersion!
      // Independent mode: surface the package being released as the project,
      // not the monorepo meta-root.
      const releaseProject = isIndependent
        ? {
            ...project!,
            name: finalPackageBumps[0].name,
            version: finalPackageBumps[0].currentVersion,
          }
        : project!
      const releaseCtx: ReleaseContext = {
        project: releaseProject,
        bump: effectiveBump,
        newVersion: effectiveVersion,
        tag: isIndependent ? `${finalPackageBumps[0].name}@${finalPackageBumps[0].newVersion}` : `v${effectiveVersion}`,
        env,
        answers: finalAnswers,
        projectConfig,
        releaserConfig,
        preRelease: finalPreRelease,
        packageBumps: isIndependent ? finalPackageBumps : undefined,
      }
      const steps = getPipelineSteps(releaseCtx)
      setPipelineSteps(steps)
      setCtx(releaseCtx)
      setPhase('confirm')
    },
    [project, bump, newVersion, preRelease, env, projectConfig, releaserConfig, packageBumps],
  )

  const handleVersionSelect = useCallback(
    (selectedBump: Bump, selectedNewVersion: string, channel?: PreReleaseChannel) => {
      setBump(selectedBump)
      setNewVersion(selectedNewVersion)
      setPreRelease(channel)

      if (projectConfig.options.length > 0) {
        setPhase('options')
      } else {
        buildContextAndConfirm(answers, {
          bump: selectedBump,
          newVersion: selectedNewVersion,
          preRelease: channel,
        })
      }
    },
    [projectConfig, buildContextAndConfirm, answers],
  )

  const handleOptionsComplete = useCallback(
    (selectedAnswers: Answers) => {
      setAnswers(selectedAnswers)
      buildContextAndConfirm(selectedAnswers)
    },
    [buildContextAndConfirm],
  )

  const handleConfirm = useCallback(() => {
    setPhase('release')
  }, [])

  const handleCancel = useCallback(() => {
    setPhase('cancelled')
    setTimeout(() => exit(), 100)
  }, [exit])

  const handleReleaseDone = useCallback((url?: string) => {
    setReleaseUrl(url)
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
          {newVersion && phase !== 'version' && packageBumps.length === 0 && (
            <Box gap={1}>
              <Text color="green">✔</Text>
              <Text>
                Version:{' '}
                <Text color="cyan" bold>
                  {project.version} → {newVersion}
                </Text>
                {preRelease && (
                  <Text dimColor> ({preRelease})</Text>
                )}
              </Text>
            </Box>
          )}
          {packageBumps.length > 0 && phase !== 'package-select' && (
            <Box flexDirection="column">
              {packageBumps.map(b => (
                <Box key={b.relativePath} gap={1}>
                  <Text color="green">✔</Text>
                  <Text>
                    {b.name}:{' '}
                    <Text color="cyan" bold>
                      {b.currentVersion} → {b.newVersion}
                    </Text>
                  </Text>
                </Box>
              ))}
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
        {phase === 'package-select' && selectablePackages.length > 0 && (
          <PackageSelect
            packages={selectablePackages}
            onComplete={(selectedBumps) => {
              setPackageBumps(selectedBumps)
              if (projectConfig.options.length > 0) {
                setPhase('options')
              } else {
                buildContextAndConfirm(answers, { packageBumps: selectedBumps })
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
        {phase === 'done' && ctx && <DonePhase ctx={ctx} releaseUrl={releaseUrl} />}
        {phase === 'error' && <ErrorPhase error={error} />}
        {phase === 'cancelled' && <CancelledPhase />}
      </Box>
    </Box>
  )
}
