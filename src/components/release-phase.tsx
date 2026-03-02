import React, { useEffect, useReducer } from 'react'
import { Box, Text } from 'ink'
import { StepList } from './step-list.js'
import { executePipeline } from '../lib/pipelines/index.js'
import type { PipelineStep, ReleaseContext, StepStatus } from '../lib/types.js'

interface ReleasePhaseProps {
  ctx: ReleaseContext
  pipelineSteps: PipelineStep[]
  onDone: () => void
  onError: (error: string) => void
}

interface StepState {
  id: string
  label: string
  status: StepStatus
  error?: string
}

type StepAction =
  | { type: 'start'; id: string }
  | { type: 'done'; id: string }
  | { type: 'error'; id: string; error: string }
  | { type: 'skipped'; id: string }

function stepsReducer(state: StepState[], action: StepAction): StepState[] {
  return state.map((step) => {
    if (step.id !== action.id) return step
    switch (action.type) {
      case 'start':
        return { ...step, status: 'running' }
      case 'done':
        return { ...step, status: 'done' }
      case 'error':
        return { ...step, status: 'error', error: action.error }
      case 'skipped':
        return { ...step, status: 'skipped' }
      default:
        return step
    }
  })
}

export function ReleasePhase({ ctx, pipelineSteps, onDone, onError }: ReleasePhaseProps) {
  const initialSteps: StepState[] = pipelineSteps.map((s) => ({
    id: s.id,
    label: s.label,
    status: 'pending' as StepStatus,
  }))

  const [steps, dispatch] = useReducer(stepsReducer, initialSteps)

  useEffect(() => {
    executePipeline(
      pipelineSteps,
      ctx,
      (id) => dispatch({ type: 'start', id }),
      (id) => dispatch({ type: 'done', id }),
      (id, error) => dispatch({ type: 'error', id, error }),
      (id) => dispatch({ type: 'skipped', id }),
    ).then((result) => {
      if (result.success) {
        // Small delay to show the final checkmark
        setTimeout(onDone, 300)
      } else {
        onError(result.error || 'Release failed')
      }
    })
  }, [])

  return (
    <Box flexDirection="column">
      <StepList steps={steps} title="Releasing..." />
    </Box>
  )
}
