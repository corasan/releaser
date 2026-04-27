import { Box, Text, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import { useState } from 'react'
import type { PackageConfig, ReleaserConfig, VersioningStrategy } from '../lib/types.js'
import type { WorkspacePackage } from '../lib/workspace.js'
import { writeReleaserConfig } from '../lib/config.js'
import { Indicator, ItemComponent } from './select-components.js'

interface InitPhaseProps {
  cwd: string
  packages: WorkspacePackage[]
  onComplete: (config: ReleaserConfig) => void
  onSkip: () => void
}

type Step = 'confirm' | 'versioning' | 'packages' | 'version-source' | 'writing'

export function InitPhase({ cwd, packages, onComplete, onSkip }: InitPhaseProps) {
  const [step, setStep] = useState<Step>('confirm')
  const [versioning, setVersioning] = useState<VersioningStrategy>('synchronized')
  const [packageConfigs, setPackageConfigs] = useState<Record<string, PackageConfig>>({})
  const [currentPkgIndex, setCurrentPkgIndex] = useState(0)

  const finalize = (configs: Record<string, PackageConfig>, versionSource?: string) => {
    setStep('writing')
    const config: ReleaserConfig = {
      versioning,
      ...(versionSource ? { versionSource } : {}),
      packages: configs,
    }
    writeReleaserConfig(cwd, config).then(() => onComplete(config))
  }

  useInput((input, _key) => {
    if (step !== 'confirm') return
    const lower = input.toLowerCase()
    if (lower === 'y' || input === '\r') {
      setStep('versioning')
    } else if (lower === 'n') {
      onSkip()
    }
  })

  const handleVersioningSelect = (item: { value: string }) => {
    setVersioning(item.value as VersioningStrategy)
    setStep('packages')
  }

  const handlePackageSelect = (item: { value: string }) => {
    const pkg = packages[currentPkgIndex]
    let newConfigs = packageConfigs
    if (item.value !== 'skip') {
      const publish = item.value === 'npm' ? 'npm' : false
      newConfigs = {
        ...packageConfigs,
        [pkg.relativePath]: { bump: true, publish } as PackageConfig,
      }
      setPackageConfigs(newConfigs)
    }

    if (currentPkgIndex + 1 < packages.length) {
      setCurrentPkgIndex(currentPkgIndex + 1)
      return
    }

    // Done iterating
    const includedCount = Object.keys(newConfigs).length
    if (includedCount === 0) {
      // User skipped everything — nothing to release. Bail to the
      // standard (non-monorepo) flow.
      onSkip()
      return
    }
    if (versioning === 'synchronized' && includedCount > 1) {
      setStep('version-source')
      return
    }
    finalize(newConfigs)
  }

  const handleVersionSourceSelect = (item: { value: string }) => {
    finalize(packageConfigs, item.value)
  }

  const versioningItems = [
    { key: 'synchronized', label: 'Synchronized (all packages share version)', value: 'synchronized' },
    { key: 'independent', label: 'Independent (per-package versions)', value: 'independent' },
  ]

  if (step === 'confirm') {
    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text color="yellow">?</Text>
          <Text>
            Detected monorepo with <Text bold color="cyan">{packages.length}</Text> packages. Configure releaser?
          </Text>
          <Text dimColor>(Y/n)</Text>
        </Box>
      </Box>
    )
  }

  if (step === 'versioning') {
    return (
      <Box flexDirection="column">
        <Box gap={1} marginBottom={1}>
          <Text color="green">✔</Text>
          <Text>Monorepo configuration started</Text>
        </Box>
        <Box marginBottom={1}>
          <Text bold>Versioning strategy?</Text>
        </Box>
        <SelectInput
          items={versioningItems}
          onSelect={handleVersioningSelect}
          indicatorComponent={Indicator}
          itemComponent={ItemComponent}
        />
      </Box>
    )
  }

  if (step === 'packages') {
    const pkg = packages[currentPkgIndex]
    // Default: private packages skip (e.g. example apps in Nitro modules),
    // public packages publish to npm.
    const defaultIndex = pkg.private ? 2 : 0
    const publishItems = [
      { key: 'npm', label: 'Publish to npm', value: 'npm' },
      { key: 'false', label: 'Internal only (bump, no publish)', value: 'false' },
      { key: 'skip', label: 'Skip — exclude from releases', value: 'skip' },
    ]

    return (
      <Box flexDirection="column">
        <Box gap={1} marginBottom={0}>
          <Text color="green">✔</Text>
          <Text>
            Versioning: <Text color="cyan" bold>{versioning}</Text>
          </Text>
        </Box>

        {/* Show already-configured packages */}
        {Object.entries(packageConfigs).map(([name, config]) => (
          <Box key={name} gap={1}>
            <Text color="green">✔</Text>
            <Text>
              {name}: <Text color="cyan" bold>{config.publish === false ? 'internal' : config.publish}</Text>
            </Text>
          </Box>
        ))}

        <Box marginBottom={1} marginTop={1}>
          <Text bold>
            Release <Text color="yellow">{pkg.name}</Text>
            {pkg.private ? <Text dimColor> (private)</Text> : ''}?
          </Text>
        </Box>
        <SelectInput
          items={publishItems}
          initialIndex={defaultIndex}
          onSelect={handlePackageSelect}
          indicatorComponent={Indicator}
          itemComponent={ItemComponent}
        />
      </Box>
    )
  }

  if (step === 'version-source') {
    const includedPackages = packages.filter(p => packageConfigs[p.relativePath])
    const items = includedPackages.map(pkg => {
      const target = packageConfigs[pkg.relativePath]
      const suffix = target?.publish === 'npm' ? ' — publishes to npm' : ''
      return {
        key: pkg.relativePath,
        label: `${pkg.name} (v${pkg.version})${suffix}`,
        value: pkg.relativePath,
      }
    })

    const defaultIndex = Math.max(
      0,
      includedPackages.findIndex(p => packageConfigs[p.relativePath]?.publish !== false),
    )

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text color="green">✔</Text>
          <Text>
            Versioning: <Text color="cyan" bold>{versioning}</Text>
          </Text>
        </Box>
        {Object.entries(packageConfigs).map(([name, config]) => (
          <Box key={name} gap={1}>
            <Text color="green">✔</Text>
            <Text>
              {name}: <Text color="cyan" bold>{config.publish === false ? 'no' : config.publish}</Text>
            </Text>
          </Box>
        ))}
        <Box marginBottom={1} marginTop={1}>
          <Text bold>Which package's version drives the release?</Text>
        </Box>
        <SelectInput
          items={items}
          initialIndex={defaultIndex}
          onSelect={handleVersionSourceSelect}
          indicatorComponent={Indicator}
          itemComponent={ItemComponent}
        />
      </Box>
    )
  }

  // step === 'writing'
  return (
    <Box gap={1}>
      <Text color="yellow">⠋</Text>
      <Text>Writing releaser.json...</Text>
    </Box>
  )
}
