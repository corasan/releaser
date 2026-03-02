import { describe, expect, test } from 'bun:test'
import { bumpVersion, isValidVersion, previewVersions } from './version.js'

describe('bumpVersion', () => {
  test('patch', () => expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4'))
  test('minor', () => expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0'))
  test('major', () => expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0'))
  test('zeros', () => expect(bumpVersion('0.0.0', 'patch')).toBe('0.0.1'))
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
  test('invalid - missing patch', () => expect(isValidVersion('1.2')).toBe(false))
  test('invalid - has prefix', () => expect(isValidVersion('v1.2.3')).toBe(false))
  test('invalid - empty', () => expect(isValidVersion('')).toBe(false))
})
