import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import { useEffect, useState } from 'react'
import type { Answers, UIOption } from '../lib/types.js'

interface DynamicOptionsProps {
  options: UIOption[]
  onComplete: (answers: Answers) => void
}

function Indicator({ isSelected }: { isSelected?: boolean }) {
  return (
    <Box marginRight={1}>
      <Text color={isSelected ? 'cyan' : undefined}>
        {isSelected ? '▸' : ' '}
      </Text>
    </Box>
  )
}

function OptionItem({
  isSelected,
  label,
}: {
  isSelected?: boolean
  label: string
}) {
  return (
    <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
      {label}
    </Text>
  )
}

/**
 * Config-driven options renderer.
 *
 * Takes an array of UIOption (generated from project config files)
 * and renders them as sequential interactive prompts.
 * Supports conditional display via `when` predicates.
 *
 * This is the "server-driven UI" for the terminal — the project
 * config files define what options appear.
 */
export function DynamicOptions({ options, onComplete }: DynamicOptionsProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})

  // Find the next visible option (respecting `when` predicates)
  const findNextIndex = (
    fromIndex: number,
    currentAnswers: Answers,
  ): number => {
    for (let i = fromIndex; i < options.length; i++) {
      const opt = options[i]
      if (!opt.when || opt.when(currentAnswers)) {
        return i
      }
    }
    return options.length // past the end = all done
  }

  // On mount, skip to first visible option
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    const first = findNextIndex(0, {})
    if (first >= options.length) {
      onComplete({})
    } else {
      setCurrentIndex(first)
    }
  }, [])

  const handleSelect = (value: string) => {
    const current = options[currentIndex]
    const newAnswers = { ...answers, [current.id]: value }
    setAnswers(newAnswers)

    // Find next visible option
    const next = findNextIndex(currentIndex + 1, newAnswers)
    if (next >= options.length) {
      // All done
      onComplete(newAnswers)
    } else {
      setCurrentIndex(next)
    }
  }

  const current = options[currentIndex]
  if (!current) return null

  // Build select items with hints
  const selectItems = current.items.map(item => ({
    key: item.value,
    label: item.hint ? `${item.label}  ${item.hint}` : item.label,
    value: item.value,
  }))

  return (
    <Box flexDirection="column">
      {/* Show completed answers */}
      {Object.entries(answers).map(([id, value]) => {
        const opt = options.find(o => o.id === id)
        if (!opt) return null
        const selectedItem = opt.items.find(i => i.value === value)
        return (
          <Box key={id} gap={1}>
            <Text color="green">✔</Text>
            <Text>
              {opt.label}:{' '}
              <Text color="cyan" bold>
                {selectedItem?.label || value}
              </Text>
            </Text>
          </Box>
        )
      })}

      {/* Current option */}
      <Box marginBottom={1} marginTop={Object.keys(answers).length > 0 ? 1 : 0}>
        <Text bold>{current.label}</Text>
      </Box>
      <SelectInput
        items={selectItems}
        onSelect={item => handleSelect(item.value)}
        indicatorComponent={Indicator}
        itemComponent={OptionItem}
      />
    </Box>
  )
}
