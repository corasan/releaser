import type { PipelineStep, ReleaseContext } from '../types.js'
import { getExpoSteps } from './expo.js'
import { getMacosSteps } from './macos.js'
import { getNpmSteps, getPublishOnlySteps } from './npm.js'
import { getTauriSteps } from './tauri.js'

export function getPipelineSteps(ctx: ReleaseContext, publishOnly?: boolean): PipelineStep[] {
  if (publishOnly) return getPublishOnlySteps(ctx)

  const type = ctx.project.type

  switch (type) {
    case 'npm':
      return getNpmSteps(ctx)
    case 'expo':
      return getExpoSteps(ctx)
    case 'tauri':
      return getTauriSteps(ctx)
    case 'macos':
      return getMacosSteps(ctx)
    default:
      return getNpmSteps(ctx)
  }
}

function getErrorMessage(err: unknown): string {
  // Bun shell errors have stderr with the actual error output
  if (err && typeof err === 'object' && 'stderr' in err) {
    const stderr = (err as { stderr: Buffer }).stderr?.toString().trim()
    if (stderr) return stderr
  }
  if (err instanceof Error) return err.message
  return String(err)
}

export async function executePipeline(
  steps: PipelineStep[],
  ctx: ReleaseContext,
  onStepStart: (stepId: string) => void,
  onStepDone: (stepId: string, output?: string) => void,
  onStepError: (stepId: string, error: string) => void,
  onStepSkipped: (stepId: string) => void,
): Promise<{ success: boolean; failedStep?: string; error?: string; outputs?: Record<string, string> }> {
  const outputs: Record<string, string> = {}
  for (const step of steps) {
    if (step.skip?.(ctx)) {
      onStepSkipped(step.id)
      continue
    }

    onStepStart(step.id)

    try {
      const output = await step.execute(ctx)
      if (output) outputs[step.id] = output
      onStepDone(step.id, output || undefined)
    } catch (err) {
      const message = getErrorMessage(err)
      onStepError(step.id, message)
      return { success: false, failedStep: step.id, error: message }
    }
  }

  return { success: true, outputs }
}
