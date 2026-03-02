import type { Bump } from './types.js'

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
  return {
    patch: bumpVersion(current, 'patch'),
    minor: bumpVersion(current, 'minor'),
    major: bumpVersion(current, 'major'),
  }
}

export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version)
}
