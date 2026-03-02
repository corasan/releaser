import { describe, expect, test } from 'bun:test'
import { getProjectTypeLabel } from './detect.js'

describe('getProjectTypeLabel', () => {
  test('npm', () => expect(getProjectTypeLabel('npm')).toBe('npm package'))
  test('expo', () => expect(getProjectTypeLabel('expo')).toBe('Expo app'))
  test('tauri', () => expect(getProjectTypeLabel('tauri')).toBe('Tauri app'))
  test('macos', () => expect(getProjectTypeLabel('macos')).toBe('macOS app'))
  test('unknown', () => expect(getProjectTypeLabel('unknown')).toBe('Unknown project'))
  test('fallback', () => expect(getProjectTypeLabel('other')).toBe('other'))
})
