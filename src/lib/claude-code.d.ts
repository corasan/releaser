declare module '@anthropic-ai/claude-code' {
  interface QueryOptions {
    maxTurns?: number
    systemPrompt?: string
    allowedTools?: string[]
  }

  interface Message {
    type: string
    text?: string
  }

  export function query(params: {
    prompt: string
    options?: QueryOptions
  }): Promise<Message[]>
}
