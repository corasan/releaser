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
  macos?: { xcodeProject: string; scheme?: string }
}

export interface ReleaseConfig {
  type?: ProjectType
  npm?: {
    publish?: boolean
    registry?: string
    access?: 'public' | 'restricted'
  }
  expo?: {
    buildPlatform?: 'ios' | 'android' | 'all'
    submitToStore?: boolean
    profile?: string
  }
  tauri?: {
    build?: boolean
    targets?: string[]
  }
  macos?: {
    scheme?: string
    notarize?: boolean
    identity?: string
  }
  github?: {
    release?: boolean
    generateNotes?: boolean
    draft?: boolean
  }
  ai?: {
    changelog?: boolean
  }
  hooks?: {
    beforeRelease?: string
    afterRelease?: string
  }
}

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
  config: ReleaseConfig
  changelog?: string
  dryRun?: boolean
}

export interface CompletedPhase {
  label: string
  value: string
}
