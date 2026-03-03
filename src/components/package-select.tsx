import { Box, Text, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import { useState } from 'react'
import type { Bump, PackageBump, PreReleaseChannel } from '../lib/types.js'
import { bumpPreRelease, bumpToStable, bumpVersion, getPreReleaseBumpItems, isPreRelease, parseVersion, previewVersions } from '../lib/version.js'
import { Indicator, ItemComponent } from './select-components.js'

interface PackageInfo {
  relativePath: string
  name: string
  version: string
}

interface PackageSelectProps {
  packages: PackageInfo[]
  onComplete: (bumps: PackageBump[]) => void
  onCancel: () => void
}

type Step = 'select' | 'bump'

export function PackageSelect({ packages, onComplete, onCancel }: PackageSelectProps) {
  const [step, setStep] = useState<Step>('select')
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [currentBumpIndex, setCurrentBumpIndex] = useState(0)
  const [bumps, setBumps] = useState<PackageBump[]>([])

  const selectedPackages = Array.from(selected).sort().map(i => packages[i])

  useInput((input, key) => {
    if (step !== 'select') return

    if (key.upArrow) {
      setCursor(prev => (prev > 0 ? prev - 1 : packages.length - 1))
    } else if (key.downArrow) {
      setCursor(prev => (prev < packages.length - 1 ? prev + 1 : 0))
    } else if (input === ' ') {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(cursor)) {
          next.delete(cursor)
        } else {
          next.add(cursor)
        }
        return next
      })
    } else if (key.return) {
      if (selected.size === 0) {
        onCancel()
        return
      }
      setStep('bump')
      setCurrentBumpIndex(0)
    } else if (key.escape) {
      onCancel()
    }
  })

  const advanceOrComplete = (newBumps: PackageBump[]) => {
    if (currentBumpIndex + 1 < selectedPackages.length) {
      setCurrentBumpIndex(currentBumpIndex + 1)
    } else {
      onComplete(newBumps)
    }
  }

  const handleBumpSelect = (item: { value: string }) => {
    const pkg = selectedPackages[currentBumpIndex]
    const version = pkg.version

    let newVersion: string
    let bump: Bump
    let preRelease: PreReleaseChannel | undefined

    if (item.value === 'bump-pre') {
      const channel = parseVersion(version).preRelease!.channel
      newVersion = bumpPreRelease(version, null, channel)
      bump = 'patch'
      preRelease = channel
    } else if (item.value === 'stable') {
      newVersion = bumpToStable(version)
      bump = 'patch'
    } else if (['alpha', 'beta', 'rc'].includes(item.value)) {
      const ch = item.value as PreReleaseChannel
      newVersion = bumpPreRelease(version, null, ch)
      bump = 'patch'
      preRelease = ch
    } else {
      bump = item.value as Bump
      newVersion = bumpVersion(version, bump)
    }

    const newBump: PackageBump = {
      relativePath: pkg.relativePath,
      name: pkg.name,
      bump,
      currentVersion: version,
      newVersion,
      preRelease,
    }

    const newBumps = [...bumps, newBump]
    setBumps(newBumps)
    advanceOrComplete(newBumps)
  }

  if (step === 'select') {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Select packages to release:</Text>
          <Text dimColor> (space to toggle, enter to confirm)</Text>
        </Box>
        {packages.map((pkg, i) => (
          <Box key={pkg.relativePath} gap={1}>
            <Text color={i === cursor ? 'cyan' : undefined}>
              {i === cursor ? '>' : ' '}
            </Text>
            <Text>{selected.has(i) ? '[x]' : '[ ]'}</Text>
            <Text color={i === cursor ? 'cyan' : 'white'} bold={i === cursor}>
              {pkg.name}
            </Text>
            <Text dimColor>v{pkg.version}</Text>
          </Box>
        ))}
      </Box>
    )
  }

  // step === 'bump'
  const pkg = selectedPackages[currentBumpIndex]
  const pkgIsPreRelease = isPreRelease(pkg.version)

  let bumpItems: { key: string; label: string; value: string }[]

  if (pkgIsPreRelease) {
    bumpItems = getPreReleaseBumpItems(pkg.version)
  } else {
    const versions = previewVersions(pkg.version)
    bumpItems = (['patch', 'minor', 'major'] as const).map(b => ({
      key: b,
      label: `${b.padEnd(6)} ${pkg.version} -> ${versions[b]}`,
      value: b,
    }))
  }

  return (
    <Box flexDirection="column">
      {/* Show already-configured bumps */}
      {bumps.map(b => (
        <Box key={b.relativePath} gap={1}>
          <Text color="green">+</Text>
          <Text>
            {b.name}: <Text color="cyan" bold>{b.bump}</Text>
            <Text dimColor>{` (${b.currentVersion} → ${b.newVersion})`}</Text>
          </Text>
        </Box>
      ))}

      <Box marginBottom={1} marginTop={bumps.length > 0 ? 1 : 0}>
        <Text bold>
          Bump type for <Text color="yellow">{pkg.name}</Text>
          <Text dimColor> (v{pkg.version})</Text>?
        </Text>
      </Box>
      <SelectInput
        items={bumpItems}
        onSelect={handleBumpSelect}
        indicatorComponent={Indicator}
        itemComponent={ItemComponent}
      />
    </Box>
  )
}
