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
    const base = bumpVersion(`${parsed.major}.${parsed.minor}.${parsed.patch}`, baseBump)
    return `${base}-${channel}.0`
  }

  const baseVersion = `${parsed.major}.${parsed.minor}.${parsed.patch}`

  if (parsed.preRelease && parsed.preRelease.channel === channel) {
    return `${baseVersion}-${channel}.${parsed.preRelease.num + 1}`
  }

  return `${baseVersion}-${channel}.0`
}

export function bumpToStable(current: string): string {
  const parsed = parseVersion(current)
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`
}

export function bumpVersion(current: string, bump: Bump): string {
  const parsed = parseVersion(current)
  switch (bump) {
    case 'major':
      return `${parsed.major + 1}.0.0`
    case 'minor':
      return `${parsed.major}.${parsed.minor + 1}.0`
    case 'patch':
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
  }
}

export function previewVersions(current: string): Record<Bump, string> {
  const parsed = parseVersion(current)
  const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`
  return {
    patch: bumpVersion(base, 'patch'),
    minor: bumpVersion(base, 'minor'),
    major: bumpVersion(base, 'major'),
  }
}

export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(-(?:alpha|beta|rc)\.\d+)?$/.test(version)
}
