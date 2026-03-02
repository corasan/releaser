import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import React from 'react'
import type { StepStatus } from '../lib/types.js'

interface StepItem {
  id: string
  label: string
  status: StepStatus
  error?: string
}

interface StepListProps {
  steps: StepItem[]
  title?: string
}

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'done':
      return <Text color="green">✔</Text>
    case 'running':
      return (
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
      )
    case 'error':
      return <Text color="red">✖</Text>
    case 'skipped':
      return <Text dimColor>⊘</Text>
    case 'pending':
    default:
      return <Text dimColor>○</Text>
  }
}

function StepRow({ step }: { step: StepItem }) {
  const dimmed = step.status === 'pending' || step.status === 'skipped'
  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <StatusIcon status={step.status} />
        <Text
          dimColor={dimmed}
          color={
            step.status === 'error'
              ? 'red'
              : step.status === 'running'
                ? 'cyan'
                : undefined
          }
          bold={step.status === 'running'}
        >
          {step.label}
          {step.status === 'running' ? '...' : ''}
        </Text>
      </Box>
      {step.error && (
        <Box marginLeft={3}>
          <Text color="red" dimColor>
            {step.error}
          </Text>
        </Box>
      )}
    </Box>
  )
}

export function StepList({ steps, title }: StepListProps) {
  return (
    <Box flexDirection="column">
      {title && (
        <Box marginBottom={1}>
          <Text bold color="white">
            {title}
          </Text>
        </Box>
      )}
      <Box flexDirection="column" marginLeft={1}>
        {steps.map(step => (
          <StepRow key={step.id} step={step} />
        ))}
      </Box>
    </Box>
  )
}
