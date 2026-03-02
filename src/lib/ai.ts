export async function generateChangelogWithAI(
  commits: string[],
): Promise<string | null> {
  if (commits.length === 0) return null

  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    const prompt = `You are a changelog generator. Analyze these git commits and generate a concise, well-organized changelog entry in markdown format.

Commits:
${commits.join('\n')}

Generate a changelog with these sections (only include sections that have relevant commits):
- **Features** - New features and capabilities
- **Bug Fixes** - Bug fixes
- **Breaking Changes** - Any breaking changes
- **Other** - Refactoring, docs, chores

Keep each entry to one line. Be concise but descriptive. Do not include commit hashes.
Output ONLY the markdown changelog content, nothing else.`

    let result = ''
    for await (const message of query({
      prompt,
      options: {
        maxTurns: 1,
        systemPrompt:
          'You are a changelog generator. Output only markdown changelog content. No explanations.',
      },
    })) {
      if ('result' in message) {
        result = message.result
      }
    }

    return result || null
  } catch {
    return null
  }
}

export async function suggestBumpFromCommits(
  commits: string[],
): Promise<{ bump: string; reason: string } | null> {
  if (commits.length === 0) return null

  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    const prompt = `Analyze these git commits and suggest a semver version bump.

Commits:
${commits.join('\n')}

Respond with ONLY a JSON object (no markdown, no code fences):
{"bump": "patch|minor|major", "reason": "one sentence reason"}

Rules:
- "major" if there are breaking changes
- "minor" if there are new features
- "patch" if there are only fixes, refactoring, or docs`

    let result = ''
    for await (const message of query({
      prompt,
      options: {
        maxTurns: 1,
        systemPrompt: 'You output only valid JSON. No explanations.',
      },
    })) {
      if ('result' in message) {
        result = message.result
      }
    }

    return JSON.parse(result.trim())
  } catch {
    return null
  }
}

export async function isAIAvailable(): Promise<boolean> {
  try {
    await import('@anthropic-ai/claude-agent-sdk')
    return true
  } catch {
    return false
  }
}
