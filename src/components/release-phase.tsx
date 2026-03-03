import { Box } from 'ink'
import { useEffect, useReducer } from 'react'
import { executePipeline } from '../lib/pipelines/index.js'
import type { PipelineStep, ReleaseContext, StepStatus } from '../lib/types.js'
import { StepList } from './step-list.js'

interface ReleasePhaseProps {
  ctx: ReleaseContext
  pipelineSteps: PipelineStep[]
  onDone: (releaseUrl?: string) => void
  onError: (error: string) => void
}

interface StepState {
  id: string
  label: string
  status: StepStatus
  error?: string
  output?: string
}

type StepAction =
  | { type: 'start'; id: string }
  | { type: 'done'; id: string; output?: string }
  | { type: 'error'; id: string; error: string }
  | { type: 'skipped'; id: string }

function stepsReducer(state: StepState[], action: StepAction): StepState[] {
  return state.map(step => {
    if (step.id !== action.id) return step
    switch (action.type) {
      case 'start':
        return { ...step, status: 'running' }
      case 'done':
        return { ...step, status: 'done', output: action.output }
      case 'error':
        return { ...step, status: 'error', error: action.error }
      case 'skipped':
        return { ...step, status: 'skipped' }
      default:
        return step
    }
  })
}

export function ReleasePhase({
  ctx,
  pipelineSteps,
  onDone,
  onError,
}: ReleasePhaseProps) {
  const initialSteps: StepState[] = pipelineSteps.map(s => ({
    id: s.id,
    label: s.label,
    status: 'pending' as StepStatus,
  }))

  const [steps, dispatch] = useReducer(stepsReducer, initialSteps)

  useEffect(() => {
    executePipeline(
      pipelineSteps,
      ctx,
      id => dispatch({ type: 'start', id }),
      (id, output) => dispatch({ type: 'done', id, output }),
      (id, error) => dispatch({ type: 'error', id, error }),
      id => dispatch({ type: 'skipped', id }),
    ).then(result => {
      if (result.success) {
        const releaseKey = Object.keys(result.outputs ?? {}).find(k => k.startsWith('github-release'))
        const releaseUrl = releaseKey ? result.outputs?.[releaseKey] : undefined
        // Small delay to show the final checkmark
        setTimeout(() => onDone(releaseUrl), 300)
      } else {
        onError(result.error || 'Release failed')
      }
    })
  }, [ctx, onDone, onError, pipelineSteps])

  return (
    <Box flexDirection="column">
      <StepList steps={steps} title="Releasing..." />
    </Box>
  )
}
