import { Box, Text } from 'ink'

export function Indicator({ isSelected }: { isSelected?: boolean }) {
  return (
    <Box marginRight={1}>
      <Text color={isSelected ? 'cyan' : undefined}>
        {isSelected ? '▸' : ' '}
      </Text>
    </Box>
  )
}

export function ItemComponent({
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
