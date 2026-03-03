import { describe, expect, test } from 'bun:test'
import { isMonorepoConfig, parseReleaserConfig, writeReleaserConfig } from './config.js'

describe('parseReleaserConfig', () => {
  test('returns null for missing config', async () => {
    const result = await parseReleaserConfig('/nonexistent/path')
    expect(result).toBeNull()
  })

  test('parses minimal config with hooks only', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/minimal`
    await Bun.write(`${tmp}/releaser.json`, JSON.stringify({
      hooks: { preBump: 'echo hello' }
    }))
    const result = await parseReleaserConfig(tmp)
    expect(result).toEqual({
      hooks: { preBump: 'echo hello' },
    })
  })

  test('parses monorepo config with packages', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/monorepo`
    await Bun.write(`${tmp}/releaser.json`, JSON.stringify({
      versioning: 'synchronized',
      packages: {
        'packages/sdk': { bump: true, publish: 'npm' },
        'packages/server': { bump: true, publish: false },
      },
      hooks: { prePublish: 'bun run build' }
    }))
    const result = await parseReleaserConfig(tmp)
    expect(result!.versioning).toBe('synchronized')
    expect(result!.packages!['packages/sdk']).toEqual({ bump: true, publish: 'npm' })
    expect(result!.packages!['packages/server']).toEqual({ bump: true, publish: false })
    expect(result!.hooks).toEqual({ prePublish: 'bun run build' })
  })

  test('defaults versioning to synchronized when packages present', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/default-versioning`
    await Bun.write(`${tmp}/releaser.json`, JSON.stringify({
      packages: {
        'packages/a': { bump: true, publish: false },
      }
    }))
    const result = await parseReleaserConfig(tmp)
    expect(result!.versioning).toBe('synchronized')
  })

  test('returns null for malformed JSON', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/malformed`
    await Bun.write(`${tmp}/releaser.json`, '{ invalid json }')
    const result = await parseReleaserConfig(tmp)
    expect(result).toBeNull()
  })

  test('returns null for invalid versioning value', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/bad-versioning`
    await Bun.write(`${tmp}/releaser.json`, JSON.stringify({
      versioning: 'wrong',
    }))
    const result = await parseReleaserConfig(tmp)
    expect(result).toBeNull()
  })

  test('returns null for non-object packages', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/bad-packages`
    await Bun.write(`${tmp}/releaser.json`, JSON.stringify({
      packages: ['a', 'b'],
    }))
    const result = await parseReleaserConfig(tmp)
    expect(result).toBeNull()
  })
})

describe('isMonorepoConfig', () => {
  test('returns true when packages exist', () => {
    expect(isMonorepoConfig({
      packages: { 'packages/a': { bump: true, publish: false } },
    })).toBe(true)
  })

  test('returns false when no packages', () => {
    expect(isMonorepoConfig({})).toBe(false)
  })

  test('returns false when packages is empty', () => {
    expect(isMonorepoConfig({ packages: {} })).toBe(false)
  })
})

describe('writeReleaserConfig', () => {
  test('writes config to disk and reads it back', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/write-test`
    const config = {
      versioning: 'independent' as const,
      packages: {
        'packages/core': { bump: true, publish: 'npm' as const },
      },
      hooks: { preBump: 'echo test' as const },
    }
    await writeReleaserConfig(tmp, config)
    const result = await parseReleaserConfig(tmp)
    expect(result).toEqual(config)
  })
})
