import { $ } from 'bun'
import type { HookName, ReleaserConfig } from './types.js'

export async function runHook(
  name: HookName,
  config: ReleaserConfig | null,
  cwd: string,
): Promise<void> {
  const command = config?.hooks?.[name]
  if (!command) return

  await $`sh -c ${command}`.cwd(cwd).quiet()
}
