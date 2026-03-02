import type { PipelineStep, ReleaseContext } from '../types.js'
import { getExpoSteps } from './expo.js'
import { getMacosSteps } from './macos.js'
import { getNpmSteps } from './npm.js'
import { getTauriSteps } from './tauri.js'

export function getPipelineSteps(ctx: ReleaseContext): PipelineStep[] {
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

export async function executePipeline(
  steps: PipelineStep[],
  ctx: ReleaseContext,
  onStepStart: (stepId: string) => void,
  onStepDone: (stepId: string) => void,
  onStepError: (stepId: string, error: string) => void,
  onStepSkipped: (stepId: string) => void,
): Promise<{ success: boolean; failedStep?: string; error?: string }> {
  for (const step of steps) {
    if (step.skip?.(ctx)) {
      onStepSkipped(step.id)
      continue
    }

    onStepStart(step.id)

    try {
      await step.execute(ctx)
      onStepDone(step.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      onStepError(step.id, message)
      return { success: false, failedStep: step.id, error: message }
    }
  }

  return { success: true }
}
