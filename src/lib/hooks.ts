import { $ } from 'bun'
import type { HookName, PipelineStep, ReleaserConfig } from './types.js'

export async function runHook(
  name: HookName,
  config: ReleaserConfig | null,
  cwd: string,
): Promise<void> {
  const command = config?.hooks?.[name]
  if (!command) return

  await $`sh -c ${command}`.cwd(cwd).quiet()
}

export function createHookStep(name: HookName): PipelineStep {
  return {
    id: `hook-${name}`,
    label: `Run ${name} hook`,
    execute: async ctx => {
      await runHook(name, ctx.releaserConfig, ctx.project.path)
    },
    skip: ctx => !ctx.releaserConfig?.hooks?.[name],
  }
}
