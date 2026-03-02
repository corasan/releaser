export type ProjectType = 'npm' | 'expo' | 'tauri' | 'macos' | 'unknown'
export type Bump = 'patch' | 'minor' | 'major'

export interface ProjectInfo {
  type: ProjectType
  name: string
  version: string
  path: string
  npm?: { private: boolean; registry?: string }
  expo?: { easConfigured: boolean; appConfig: string }
  tauri?: { configPath: string; version?: number }
  macos?: { xcodeProject: string; schemes?: string[] }
}

/** Auto-detected environment capabilities */
export interface DetectedEnv {
  hasBuildScript: boolean
  hasTestScript: boolean
  hasGhCli: boolean
  hasEasCli: boolean
}

// ─── Config-driven UI ────────────────────────────────────────────

/** A single UI option derived from project config files */
export interface UIOption {
  id: string
  label: string
  type: 'select' | 'confirm'
  items: UIOptionItem[]
  /** Only show this option if a condition on prior answers is met */
  when?: (answers: Answers) => boolean
}

export interface UIOptionItem {
  label: string
  value: string
  hint?: string
}

/** Parsed project config — the source of truth for dynamic UI + pipeline behavior */
export interface ParsedProjectConfig {
  /** Dynamic UI options generated from project config files */
  options: UIOption[]
  /** Structured data from config files, used by pipelines */
  // biome-ignore lint/suspicious/noExplicitAny: dynamic config data from JSON files
  data: Record<string, any>
}

/** Dynamic answers collected from config-driven prompts */
export type Answers = Record<string, string>

// ─── Release pipeline ────────────────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

export interface ReleaseStep {
  id: string
  label: string
  status: StepStatus
  error?: string
}

export interface PipelineStep {
  id: string
  label: string
  execute: (ctx: ReleaseContext) => Promise<void>
  skip?: (ctx: ReleaseContext) => boolean
}

export interface ReleaseContext {
  project: ProjectInfo
  bump: Bump
  newVersion: string
  tag: string
  env: DetectedEnv
  answers: Answers
  projectConfig: ParsedProjectConfig
  changelog?: string
}

export interface CompletedPhase {
  label: string
  value: string
}
