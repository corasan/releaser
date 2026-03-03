import { afterAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { bumpMonorepoVersions, getPublishablePackages } from './monorepo.js'
import type { PackageConfig } from './types.js'

const fixturesDir = join(import.meta.dir, '__fixtures__', 'monorepo')

function setup(name: string, files: Record<string, string>): string {
  const dir = join(fixturesDir, name)
  for (const [file, content] of Object.entries(files)) {
    const filePath = join(dir, file)
    mkdirSync(join(filePath, '..'), { recursive: true })
    writeFileSync(filePath, content)
  }
  return dir
}

afterAll(() => {
  rmSync(fixturesDir, { recursive: true, force: true })
})

describe('bumpMonorepoVersions', () => {
  test('bumps version in all configured packages', async () => {
    const cwd = setup('bump-all', {
      'packages/alpha/package.json': JSON.stringify({ name: '@scope/alpha', version: '1.0.0' }),
      'packages/beta/package.json': JSON.stringify({ name: '@scope/beta', version: '1.0.0' }),
    })

    const packages: Record<string, PackageConfig> = {
      'packages/alpha': { bump: true, publish: 'npm' },
      'packages/beta': { bump: true, publish: 'npm' },
    }

    await bumpMonorepoVersions(cwd, packages, '2.0.0')

    const alpha = JSON.parse(readFileSync(join(cwd, 'packages/alpha/package.json'), 'utf-8'))
    const beta = JSON.parse(readFileSync(join(cwd, 'packages/beta/package.json'), 'utf-8'))
    expect(alpha.version).toBe('2.0.0')
    expect(beta.version).toBe('2.0.0')
  })

  test('skips packages with bump: false', async () => {
    const cwd = setup('skip-bump', {
      'packages/alpha/package.json': JSON.stringify({ name: '@scope/alpha', version: '1.0.0' }),
      'packages/beta/package.json': JSON.stringify({ name: '@scope/beta', version: '1.0.0' }),
    })

    const packages: Record<string, PackageConfig> = {
      'packages/alpha': { bump: true, publish: 'npm' },
      'packages/beta': { bump: false, publish: 'npm' },
    }

    await bumpMonorepoVersions(cwd, packages, '2.0.0')

    const alpha = JSON.parse(readFileSync(join(cwd, 'packages/alpha/package.json'), 'utf-8'))
    const beta = JSON.parse(readFileSync(join(cwd, 'packages/beta/package.json'), 'utf-8'))
    expect(alpha.version).toBe('2.0.0')
    expect(beta.version).toBe('1.0.0')
  })

  test('returns list of bumped package paths', async () => {
    const cwd = setup('return-paths', {
      'packages/alpha/package.json': JSON.stringify({ name: '@scope/alpha', version: '1.0.0' }),
      'packages/beta/package.json': JSON.stringify({ name: '@scope/beta', version: '1.0.0' }),
    })

    const packages: Record<string, PackageConfig> = {
      'packages/alpha': { bump: true, publish: 'npm' },
      'packages/beta': { bump: false, publish: 'npm' },
    }

    const result = await bumpMonorepoVersions(cwd, packages, '3.0.0')
    expect(result).toEqual(['packages/alpha'])
  })
})

describe('getPublishablePackages', () => {
  test('returns only packages with publish !== false', () => {
    const packages: Record<string, PackageConfig> = {
      'packages/alpha': { bump: true, publish: 'npm' },
      'packages/beta': { bump: true, publish: false },
      'packages/gamma': { bump: false, publish: 'npm' },
    }

    const result = getPublishablePackages(packages)
    expect(result).toEqual(['packages/alpha', 'packages/gamma'])
  })

  test('returns empty array when all publish: false', () => {
    const packages: Record<string, PackageConfig> = {
      'packages/alpha': { bump: true, publish: false },
      'packages/beta': { bump: false, publish: false },
    }

    const result = getPublishablePackages(packages)
    expect(result).toEqual([])
  })
})
