import { Box, Text, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import { useState } from 'react'
import type { PackageConfig, ReleaserConfig, VersioningStrategy } from '../lib/types.js'
import type { WorkspacePackage } from '../lib/workspace.js'
import { writeReleaserConfig } from '../lib/config.js'

interface InitPhaseProps {
  cwd: string
  packages: WorkspacePackage[]
  onComplete: (config: ReleaserConfig) => void
  onSkip: () => void
}

type Step = 'confirm' | 'versioning' | 'packages' | 'writing'

function Indicator({ isSelected }: { isSelected?: boolean }) {
  return (
    <Box marginRight={1}>
      <Text color={isSelected ? 'cyan' : undefined}>
        {isSelected ? '▸' : ' '}
      </Text>
    </Box>
  )
}

function ItemComponent({
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

export function InitPhase({ cwd, packages, onComplete, onSkip }: InitPhaseProps) {
  const [step, setStep] = useState<Step>('confirm')
  const [versioning, setVersioning] = useState<VersioningStrategy>('synchronized')
  const [packageConfigs, setPackageConfigs] = useState<Record<string, PackageConfig>>({})
  const [currentPkgIndex, setCurrentPkgIndex] = useState(0)

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
    const publish = item.value === 'npm' ? 'npm' : false
    const newConfigs = {
      ...packageConfigs,
      [pkg.name]: { bump: true, publish } as PackageConfig,
    }
    setPackageConfigs(newConfigs)

    if (currentPkgIndex + 1 < packages.length) {
      setCurrentPkgIndex(currentPkgIndex + 1)
    } else {
      // All packages configured — write config
      setStep('writing')
      const config: ReleaserConfig = {
        versioning,
        packages: newConfigs,
      }
      writeReleaserConfig(cwd, config).then(() => {
        onComplete(config)
      })
    }
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
    const defaultIndex = pkg.private ? 1 : 0
    const publishItems = [
      { key: 'npm', label: 'npm', value: 'npm' },
      { key: 'false', label: 'No (internal only)', value: 'false' },
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
              {name}: <Text color="cyan" bold>{config.publish === false ? 'no' : config.publish}</Text>
            </Text>
          </Box>
        ))}

        <Box marginBottom={1} marginTop={1}>
          <Text bold>
            Publish <Text color="yellow">{pkg.name}</Text>
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

  // step === 'writing'
  return (
    <Box gap={1}>
      <Text color="yellow">⠋</Text>
      <Text>Writing releaser.json...</Text>
    </Box>
  )
}
