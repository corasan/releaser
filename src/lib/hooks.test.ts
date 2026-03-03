import { describe, expect, test } from 'bun:test'
import type { ReleaserConfig } from './types.js'
import { runHook } from './hooks.js'

describe('runHook', () => {
  test('runs a configured hook command', async () => {
    const config: ReleaserConfig = {
      hooks: { preBump: 'echo "hello"' }
    }
    // Should not throw
    await runHook('preBump', config, process.cwd())
  })

  test('skips when hook is not configured', async () => {
    const config: ReleaserConfig = {}
    // Should not throw
    await runHook('preBump', config, process.cwd())
  })

  test('skips when config is null', async () => {
    await runHook('preBump', null, process.cwd())
  })

  test('throws on hook failure', async () => {
    const config: ReleaserConfig = {
      hooks: { preBump: 'exit 1' }
    }
    expect(runHook('preBump', config, process.cwd())).rejects.toThrow()
  })
})
