import { afterAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { detectWorkspaces, resolveWorkspacePackages } from './workspace.js'

const fixturesDir = join(import.meta.dir, '__fixtures__', 'workspace')

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

describe('detectWorkspaces', () => {
  test('detects npm workspaces from package.json array', async () => {
    const cwd = setup('npm-array', {
      'package.json': JSON.stringify({
        name: 'my-monorepo',
        workspaces: ['packages/*'],
      }),
    })
    const result = await detectWorkspaces(cwd)
    expect(result).toEqual({ type: 'npm', patterns: ['packages/*'] })
  })

  test('detects npm workspaces from package.json packages object', async () => {
    const cwd = setup('npm-object', {
      'package.json': JSON.stringify({
        name: 'my-monorepo',
        workspaces: { packages: ['apps/*', 'libs/*'] },
      }),
    })
    const result = await detectWorkspaces(cwd)
    expect(result).toEqual({ type: 'npm', patterns: ['apps/*', 'libs/*'] })
  })

  test('detects pnpm workspaces from pnpm-workspace.yaml', async () => {
    const cwd = setup('pnpm', {
      'package.json': JSON.stringify({ name: 'pnpm-monorepo' }),
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n  - apps/*\n',
    })
    const result = await detectWorkspaces(cwd)
    expect(result).toEqual({ type: 'pnpm', patterns: ['packages/*', 'apps/*'] })
  })

  test('returns null for non-workspace project', async () => {
    const cwd = setup('no-workspace', {
      'package.json': JSON.stringify({ name: 'simple-project', version: '1.0.0' }),
    })
    const result = await detectWorkspaces(cwd)
    expect(result).toBeNull()
  })
})

describe('resolveWorkspacePackages', () => {
  test('resolves glob patterns to package paths with correct metadata', async () => {
    const cwd = setup('resolve', {
      'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
      'packages/alpha/package.json': JSON.stringify({
        name: '@scope/alpha',
        version: '1.2.3',
        private: true,
      }),
      'packages/beta/package.json': JSON.stringify({
        name: '@scope/beta',
        version: '0.1.0',
      }),
    })

    const packages = await resolveWorkspacePackages(cwd, ['packages/*'])
    expect(packages).toHaveLength(2)
    expect(packages[0]).toEqual({
      name: '@scope/alpha',
      version: '1.2.3',
      private: true,
      relativePath: 'packages/alpha',
      absolutePath: join(cwd, 'packages/alpha'),
    })
    expect(packages[1]).toEqual({
      name: '@scope/beta',
      version: '0.1.0',
      private: false,
      relativePath: 'packages/beta',
      absolutePath: join(cwd, 'packages/beta'),
    })
  })
})
