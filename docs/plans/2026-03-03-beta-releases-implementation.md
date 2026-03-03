# Beta Releases Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add pre-release (alpha, beta, rc) support to releaser via version logic, TUI menu, CLI flags, and npm dist-tags.

**Architecture:** Extend `version.ts` with pre-release parsing/bumping, replace `version-select.tsx` with a multi-step menu that handles both stable and pre-release flows, add CLI flags to `index.tsx`, and update the npm pipeline to use `--tag` for pre-releases.

**Tech Stack:** TypeScript, Bun, React/Ink, semver conventions

---

### Task 1: Add pre-release types to `types.ts`

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Add types**

Add `PreReleaseChannel` type and update `Bump` usage. Add a `preRelease` field to `ReleaseContext`.

```typescript
// Add after the Bump type (line 2)
export type PreReleaseChannel = 'alpha' | 'beta' | 'rc'
```

Add to `ReleaseContext` (after `changelog?: string` on line 88):

```typescript
  preRelease?: PreReleaseChannel
```

**Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add pre-release types"
```

---

### Task 2: Add pre-release version logic with tests (TDD)

**Files:**
- Modify: `src/lib/version.ts`
- Modify: `src/lib/version.test.ts`

**Step 1: Write failing tests**

Add to `src/lib/version.test.ts`:

```typescript
import { bumpVersion, isValidVersion, previewVersions, parseVersion, bumpPreRelease, bumpToStable, isPreRelease, getPreReleaseChannel } from './version.js'

describe('parseVersion', () => {
  test('stable version', () => {
    expect(parseVersion('1.2.3')).toEqual({
      major: 1, minor: 2, patch: 3, preRelease: null,
    })
  })
  test('pre-release version', () => {
    expect(parseVersion('1.3.0-beta.2')).toEqual({
      major: 1, minor: 3, patch: 0, preRelease: { channel: 'beta', num: 2 },
    })
  })
  test('alpha version', () => {
    expect(parseVersion('2.0.0-alpha.0')).toEqual({
      major: 2, minor: 0, patch: 0, preRelease: { channel: 'alpha', num: 0 },
    })
  })
  test('rc version', () => {
    expect(parseVersion('1.0.0-rc.5')).toEqual({
      major: 1, minor: 0, patch: 0, preRelease: { channel: 'rc', num: 5 },
    })
  })
})

describe('isPreRelease', () => {
  test('stable is not pre-release', () => expect(isPreRelease('1.2.3')).toBe(false))
  test('beta is pre-release', () => expect(isPreRelease('1.3.0-beta.0')).toBe(true))
  test('alpha is pre-release', () => expect(isPreRelease('1.0.0-alpha.1')).toBe(true))
  test('rc is pre-release', () => expect(isPreRelease('2.0.0-rc.0')).toBe(true))
})

describe('getPreReleaseChannel', () => {
  test('returns channel for pre-release', () => expect(getPreReleaseChannel('1.3.0-beta.2')).toBe('beta'))
  test('returns null for stable', () => expect(getPreReleaseChannel('1.2.3')).toBeNull())
})

describe('bumpPreRelease', () => {
  test('stable to beta with minor bump', () => {
    expect(bumpPreRelease('1.2.3', 'minor', 'beta')).toBe('1.3.0-beta.0')
  })
  test('stable to alpha with patch bump', () => {
    expect(bumpPreRelease('1.2.3', 'patch', 'alpha')).toBe('1.2.4-alpha.0')
  })
  test('stable to rc with major bump', () => {
    expect(bumpPreRelease('1.2.3', 'major', 'rc')).toBe('2.0.0-rc.0')
  })
  test('bump same channel', () => {
    expect(bumpPreRelease('1.3.0-beta.0', null, 'beta')).toBe('1.3.0-beta.1')
  })
  test('bump same channel again', () => {
    expect(bumpPreRelease('1.3.0-beta.2', null, 'beta')).toBe('1.3.0-beta.3')
  })
  test('promote beta to rc', () => {
    expect(bumpPreRelease('1.3.0-beta.2', null, 'rc')).toBe('1.3.0-rc.0')
  })
  test('promote alpha to beta', () => {
    expect(bumpPreRelease('1.3.0-alpha.5', null, 'beta')).toBe('1.3.0-beta.0')
  })
  test('pre-release with base bump starts new pre-release line', () => {
    expect(bumpPreRelease('1.3.0-beta.2', 'minor', 'beta')).toBe('1.4.0-beta.0')
  })
})

describe('bumpToStable', () => {
  test('rc to stable', () => expect(bumpToStable('1.3.0-rc.1')).toBe('1.3.0'))
  test('beta to stable', () => expect(bumpToStable('1.3.0-beta.5')).toBe('1.3.0'))
  test('alpha to stable', () => expect(bumpToStable('2.0.0-alpha.0')).toBe('2.0.0'))
})
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/lib/version.test.ts`
Expected: FAIL — functions don't exist yet

**Step 3: Implement the functions**

Update `src/lib/version.ts`:

```typescript
import type { Bump, PreReleaseChannel } from './types.js'

interface ParsedVersion {
  major: number
  minor: number
  patch: number
  preRelease: { channel: PreReleaseChannel; num: number } | null
}

export function parseVersion(version: string): ParsedVersion {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/)
  if (!match) throw new Error(`Invalid version: ${version}`)
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    preRelease: match[4]
      ? { channel: match[4] as PreReleaseChannel, num: Number(match[5]) }
      : null,
  }
}

export function isPreRelease(version: string): boolean {
  return parseVersion(version).preRelease !== null
}

export function getPreReleaseChannel(version: string): PreReleaseChannel | null {
  return parseVersion(version).preRelease?.channel ?? null
}

export function bumpPreRelease(
  current: string,
  baseBump: Bump | null,
  channel: PreReleaseChannel,
): string {
  const parsed = parseVersion(current)

  if (baseBump) {
    // Apply base bump first, then add pre-release suffix
    const base = bumpVersion(current.split('-')[0], baseBump)
    return `${base}-${channel}.0`
  }

  // No base bump — must already be a pre-release
  const baseVersion = `${parsed.major}.${parsed.minor}.${parsed.patch}`

  if (parsed.preRelease && parsed.preRelease.channel === channel) {
    // Same channel: increment number
    return `${baseVersion}-${channel}.${parsed.preRelease.num + 1}`
  }

  // Different channel (promotion): reset to 0
  return `${baseVersion}-${channel}.0`
}

export function bumpToStable(current: string): string {
  const parsed = parseVersion(current)
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`
}

// Existing functions below — update isValidVersion to accept pre-release
export function bumpVersion(current: string, bump: Bump): string {
  const [major, minor, patch] = current.split('.').map(Number)
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
  }
}

export function previewVersions(current: string): Record<Bump, string> {
  // Strip pre-release suffix for previewing base bumps
  const base = current.split('-')[0]
  return {
    patch: bumpVersion(base, 'patch'),
    minor: bumpVersion(base, 'minor'),
    major: bumpVersion(base, 'major'),
  }
}

export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(-(?:alpha|beta|rc)\.\d+)?$/.test(version)
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test src/lib/version.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/lib/version.ts src/lib/version.test.ts
git commit -m "feat: add pre-release version parsing and bumping"
```

---

### Task 3: Update `version-select.tsx` for pre-release TUI flow

**Files:**
- Modify: `src/components/version-select.tsx`

**Step 1: Rewrite VersionSelect component**

The component needs to handle two flows:

**From stable version:** Two-step menu (Stable/Pre-release → options)
**From pre-release version:** Single menu (Bump/Promote/Release stable)

The `onSelect` callback type changes — it now needs to communicate both the bump type and new version. Update the component to accept `onSelect: (bump: Bump, newVersion: string, preRelease?: PreReleaseChannel) => void`.

```tsx
import { Box, Text } from 'ink'
import { useState } from 'react'
import SelectInput from 'ink-select-input'
import type { Bump, PreReleaseChannel, ProjectInfo } from '../lib/types.js'
import {
  bumpPreRelease,
  bumpToStable,
  bumpVersion,
  isPreRelease,
  parseVersion,
  previewVersions,
} from '../lib/version.js'

interface VersionSelectProps {
  project: ProjectInfo
  aiSuggestion?: { bump: string; reason: string } | null
  onSelect: (bump: Bump, newVersion: string, preRelease?: PreReleaseChannel) => void
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

function VersionItem({
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

type Step = 'release-type' | 'stable-bump' | 'pre-release-bump' | 'pre-release-channel'

export function VersionSelect({
  project,
  aiSuggestion,
  onSelect,
}: VersionSelectProps) {
  const currentIsPreRelease = isPreRelease(project.version)
  const [step, setStep] = useState<Step>(currentIsPreRelease ? 'release-type' : 'release-type')
  const [baseBump, setBaseBump] = useState<Bump | null>(null)

  // ── Pre-release version: simplified menu ──
  if (currentIsPreRelease) {
    const parsed = parseVersion(project.version)
    const channel = parsed.preRelease!.channel
    const baseVersion = `${parsed.major}.${parsed.minor}.${parsed.patch}`

    const items: { key: string; label: string; value: string }[] = []

    // Bump same channel
    items.push({
      key: 'bump',
      label: `Bump ${channel}    ${project.version} → ${bumpPreRelease(project.version, null, channel)}`,
      value: 'bump',
    })

    // Promote to next channel(s)
    const channels: PreReleaseChannel[] = ['alpha', 'beta', 'rc']
    const currentIdx = channels.indexOf(channel)
    for (let i = currentIdx + 1; i < channels.length; i++) {
      const next = channels[i]
      items.push({
        key: next,
        label: `Promote to ${next}  ${project.version} → ${baseVersion}-${next}.0`,
        value: next,
      })
    }

    // Release stable
    items.push({
      key: 'stable',
      label: `Release stable  ${project.version} → ${baseVersion}`,
      value: 'stable',
    })

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>How do you want to release?</Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={item => {
            if (item.value === 'bump') {
              const newVer = bumpPreRelease(project.version, null, channel)
              onSelect('patch', newVer, channel)
            } else if (item.value === 'stable') {
              onSelect('patch', bumpToStable(project.version))
            } else {
              const ch = item.value as PreReleaseChannel
              const newVer = bumpPreRelease(project.version, null, ch)
              onSelect('patch', newVer, ch)
            }
          }}
          indicatorComponent={Indicator}
          itemComponent={VersionItem}
        />
      </Box>
    )
  }

  // ── Stable version: multi-step menu ──

  const versions = previewVersions(project.version)

  // Step 1: Stable or Pre-release?
  if (step === 'release-type') {
    const items = [
      { key: 'stable', label: 'Stable', value: 'stable' },
      { key: 'pre-release', label: 'Pre-release', value: 'pre-release' },
    ]
    return (
      <Box flexDirection="column">
        {aiSuggestion && (
          <Box marginBottom={1} gap={1}>
            <Text color="magenta">⚡</Text>
            <Text>
              AI suggests{' '}
              <Text color="magenta" bold>
                {aiSuggestion.bump}
              </Text>
              <Text dimColor> — {aiSuggestion.reason}</Text>
            </Text>
          </Box>
        )}
        <Box marginBottom={1}>
          <Text bold>How do you want to release?</Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={item => {
            if (item.value === 'stable') setStep('stable-bump')
            else setStep('pre-release-bump')
          }}
          indicatorComponent={Indicator}
          itemComponent={VersionItem}
        />
      </Box>
    )
  }

  // Step 2a: Stable bump selection (patch/minor/major)
  if (step === 'stable-bump') {
    const items = (['patch', 'minor', 'major'] as const).map(bump => ({
      key: bump,
      label: `${bump.padEnd(6)} ${project.version} → ${versions[bump]}`,
      value: bump,
    }))

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Select version bump:</Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={item => onSelect(item.value as Bump, versions[item.value as Bump])}
          indicatorComponent={Indicator}
          itemComponent={VersionItem}
        />
      </Box>
    )
  }

  // Step 2b: Pre-release base bump (patch/minor/major)
  if (step === 'pre-release-bump') {
    const items = (['patch', 'minor', 'major'] as const).map(bump => ({
      key: bump,
      label: `${bump.padEnd(6)} (${versions[bump]}-*.0)`,
      value: bump,
    }))

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Which base version?</Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={item => {
            setBaseBump(item.value as Bump)
            setStep('pre-release-channel')
          }}
          indicatorComponent={Indicator}
          itemComponent={VersionItem}
        />
      </Box>
    )
  }

  // Step 3: Channel selection (alpha/beta/rc)
  if (step === 'pre-release-channel' && baseBump) {
    const baseVersion = versions[baseBump]
    const items = (['alpha', 'beta', 'rc'] as const).map(ch => ({
      key: ch,
      label: `${ch.padEnd(6)} ${baseVersion}-${ch}.0`,
      value: ch,
    }))

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Which channel?</Text>
        </Box>
        <SelectInput
          items={items}
          onSelect={item => {
            const ch = item.value as PreReleaseChannel
            const newVer = `${baseVersion}-${ch}.0`
            onSelect(baseBump, newVer, ch)
          }}
          indicatorComponent={Indicator}
          itemComponent={VersionItem}
        />
      </Box>
    )
  }

  return null
}
```

**Step 2: Commit**

```bash
git add src/components/version-select.tsx
git commit -m "feat: add pre-release TUI flow to version select"
```

---

### Task 4: Update `app.tsx` to handle pre-release context

**Files:**
- Modify: `src/app.tsx`

**Step 1: Update state and handlers**

Changes needed:
1. Add `preRelease` state: `const [preRelease, setPreRelease] = useState<PreReleaseChannel | undefined>()`
2. Import `PreReleaseChannel` from types
3. Update `handleVersionSelect` signature to `(selectedBump: Bump, newVersion: string, channel?: PreReleaseChannel)`
4. Store `newVersion` directly in state instead of computing it later (add `newVersion` state)
5. Update `buildContextAndConfirm` to include `preRelease` in the `ReleaseContext`
6. Update the version badge display to show the actual `newVersion` instead of computing `bumpVersion(project.version, bump)`

Key changes to `handleVersionSelect`:

```typescript
const handleVersionSelect = useCallback(
  (selectedBump: Bump, selectedNewVersion: string, channel?: PreReleaseChannel) => {
    setBump(selectedBump)
    setNewVersion(selectedNewVersion)
    setPreRelease(channel)
    if (projectConfig.options.length > 0) {
      setPhase('options')
    } else {
      setPhase('ai')
    }
  },
  [projectConfig],
)
```

Update `buildContextAndConfirm` to use `newVersion` state instead of computing:

```typescript
const effectiveVersion = isIndependent ? packageBumps[0].newVersion : newVersion!
```

Add `preRelease` to the `ReleaseContext`:

```typescript
preRelease,
```

Update the `VersionSelect` usage to pass the new callback:

```tsx
<VersionSelect project={project} onSelect={handleVersionSelect} />
```

Update the version badge (lines 223-235) to use `newVersion` state:

```tsx
{newVersion && phase !== 'version' && (
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
```

**Step 2: Commit**

```bash
git add src/app.tsx
git commit -m "feat: wire pre-release state through app"
```

---

### Task 5: Update npm pipeline for dist-tags

**Files:**
- Modify: `src/lib/pipelines/npm.ts`

**Step 1: Add dist-tag to npm publish commands**

In `getNpmSteps`, update all `npm publish` calls to include `--tag <channel>` when `ctx.preRelease` is set.

For single-package publish (around line 175):

```typescript
steps.push({
  id: 'npm-publish',
  label: ctx.preRelease
    ? `Publish to npm (tag: ${ctx.preRelease})`
    : 'Publish to npm',
  execute: async ctx => {
    if (ctx.preRelease) {
      await $`npm publish --tag ${ctx.preRelease}`.cwd(ctx.project.path)
    } else {
      await $`npm publish`.cwd(ctx.project.path)
    }
  },
})
```

For monorepo publishes (both independent and synchronized), same pattern — add `--tag ${ctx.preRelease}` when `ctx.preRelease` is set.

Also update the GitHub release step: when `ctx.preRelease` is set, add `--prerelease` flag to `gh release create`:

```typescript
// In git.ts, update createGitHubRelease signature:
export async function createGitHubRelease(
  tag: string,
  notes?: string,
  isPreRelease?: boolean,
): Promise<void> {
  const args = isPreRelease ? ['--prerelease'] : []
  if (notes) {
    await $`gh release create ${tag} --notes ${notes} ${args}`
  } else {
    await $`gh release create ${tag} --generate-notes ${args}`
  }
}
```

And pass it from the pipeline:

```typescript
await createGitHubRelease(ctx.tag, ctx.changelog, !!ctx.preRelease)
```

**Step 2: Commit**

```bash
git add src/lib/pipelines/npm.ts src/lib/git.ts
git commit -m "feat: add npm dist-tags and GitHub pre-release flag"
```

---

### Task 6: Add CLI flags for pre-releases

**Files:**
- Modify: `src/index.tsx`

**Step 1: Parse and validate CLI flags**

Add flag parsing after the `--help` block, before `render(<App />)`:

```tsx
import { parseVersion, isPreRelease, bumpPreRelease, bumpToStable, bumpVersion } from './lib/version.js'
import type { Bump, PreReleaseChannel } from './lib/types.js'

// Parse CLI flags
const args = process.argv.slice(2)
const flags = {
  alpha: args.includes('--alpha'),
  beta: args.includes('--beta'),
  rc: args.includes('--rc'),
  bump: args.includes('--bump'),
  patch: args.includes('--patch'),
  minor: args.includes('--minor'),
  major: args.includes('--major'),
}

// Validate mutually exclusive flags
const channelFlags = [flags.alpha, flags.beta, flags.rc].filter(Boolean)
if (channelFlags.length > 1) {
  console.error('Error: Only one of --alpha, --beta, --rc can be specified')
  process.exit(1)
}

if (flags.bump && channelFlags.length > 0) {
  console.error('Error: --bump cannot be combined with --alpha, --beta, or --rc')
  process.exit(1)
}

const bumpFlags = [flags.patch, flags.minor, flags.major].filter(Boolean)
if (bumpFlags.length > 1) {
  console.error('Error: Only one of --patch, --minor, --major can be specified')
  process.exit(1)
}

// Determine CLI overrides
let cliChannel: PreReleaseChannel | undefined
if (flags.alpha) cliChannel = 'alpha'
else if (flags.beta) cliChannel = 'beta'
else if (flags.rc) cliChannel = 'rc'

let cliBump: Bump | undefined
if (flags.patch) cliBump = 'patch'
else if (flags.minor) cliBump = 'minor'
else if (flags.major) cliBump = 'major'

const cliBumpFlag = flags.bump

// Pass to App
render(<App cliChannel={cliChannel} cliBump={cliBump} cliBumpFlag={cliBumpFlag} />)
```

Update `--help` output to include new flags.

**Step 2: Update App component to accept CLI props**

In `app.tsx`, add props interface:

```typescript
interface AppProps {
  cliChannel?: PreReleaseChannel
  cliBump?: Bump
  cliBumpFlag?: boolean
}

export function App({ cliChannel, cliBump, cliBumpFlag }: AppProps) {
```

In `handleDetected`, after determining the phase, if CLI flags are present, skip directly to the appropriate phase by computing the version and jumping to 'options' or 'ai':

```typescript
// After setPhase('version') would normally be called:
if (cliChannel || cliBumpFlag || cliBump) {
  // Compute version from flags and skip version select
  const currentVersion = proj.version
  const currentIsPreRelease = isPreRelease(currentVersion)

  if (cliBumpFlag) {
    if (!currentIsPreRelease) {
      setError('Error: --bump requires a pre-release version')
      setPhase('error')
      setTimeout(() => exit(), 100)
      return
    }
    const channel = getPreReleaseChannel(currentVersion)!
    const newVer = bumpPreRelease(currentVersion, null, channel)
    setNewVersion(newVer)
    setBump('patch')
    setPreRelease(channel)
  } else if (cliChannel) {
    if (!currentIsPreRelease && !cliBump) {
      setError('Error: --' + cliChannel + ' from stable requires --patch, --minor, or --major')
      setPhase('error')
      setTimeout(() => exit(), 100)
      return
    }
    const newVer = currentIsPreRelease
      ? bumpPreRelease(currentVersion, cliBump ?? null, cliChannel)
      : bumpPreRelease(currentVersion, cliBump!, cliChannel)
    setNewVersion(newVer)
    setBump(cliBump ?? 'patch')
    setPreRelease(cliChannel)
  } else if (cliBump) {
    // Just a base bump, no pre-release
    const newVer = bumpVersion(currentVersion, cliBump)
    setNewVersion(newVer)
    setBump(cliBump)
  }

  if (projectConfig.options.length > 0) {
    setPhase('options')
  } else {
    setPhase('ai')
  }
  return
}
```

**Step 3: Commit**

```bash
git add src/index.tsx src/app.tsx
git commit -m "feat: add CLI flags for pre-releases"
```

---

### Task 7: Update help text and version display

**Files:**
- Modify: `src/index.tsx`

**Step 1: Update help text**

Add to the help output after the `releaser --help` line:

```
    releaser --patch         Patch release (skip version select)
    releaser --minor         Minor release
    releaser --major         Major release
    releaser --beta --minor  Pre-release: 1.2.3 → 1.3.0-beta.0
    releaser --alpha --patch Alpha: 1.2.3 → 1.2.4-alpha.0
    releaser --rc            Promote to RC (from pre-release)
    releaser --bump          Bump pre-release: 1.3.0-beta.0 → 1.3.0-beta.1
```

**Step 2: Commit**

```bash
git add src/index.tsx
git commit -m "docs: update CLI help with pre-release flags"
```

---

### Task 8: Run full test suite and verify

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 2: Manual smoke test**

Run: `bun run src/index.tsx --help`
Expected: Shows updated help with pre-release flags

**Step 3: Commit any fixes if needed**
