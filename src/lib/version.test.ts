import { describe, expect, test } from 'bun:test'
import { bumpVersion, isValidVersion, previewVersions, parseVersion, bumpPreRelease, bumpToStable, isPreRelease, getPreReleaseChannel } from './version.js'

describe('bumpVersion', () => {
  test('patch', () => expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4'))
  test('minor', () => expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0'))
  test('major', () => expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0'))
  test('zeros', () => expect(bumpVersion('0.0.0', 'patch')).toBe('0.0.1'))
  test('strips pre-release suffix', () => expect(bumpVersion('1.3.0-beta.2', 'patch')).toBe('1.3.1'))
})

describe('previewVersions', () => {
  test('returns all bumps', () => {
    expect(previewVersions('1.2.3')).toEqual({
      patch: '1.2.4',
      minor: '1.3.0',
      major: '2.0.0',
    })
  })
})

describe('isValidVersion', () => {
  test('valid semver', () => expect(isValidVersion('1.2.3')).toBe(true))
  test('valid pre-release', () => expect(isValidVersion('1.2.3-beta.0')).toBe(true))
  test('invalid - missing patch', () => expect(isValidVersion('1.2')).toBe(false))
  test('invalid - has prefix', () => expect(isValidVersion('v1.2.3')).toBe(false))
  test('invalid - empty', () => expect(isValidVersion('')).toBe(false))
})

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
  test('throws on invalid version', () => {
    expect(() => parseVersion('invalid')).toThrow()
    expect(() => parseVersion('v1.2.3')).toThrow()
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
