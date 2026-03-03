import { $ } from 'bun'

export async function getCommitsSinceLastTag(): Promise<string[]> {
  try {
    const lastTag = (
      await $`git describe --tags --abbrev=0 2>/dev/null`.text()
    ).trim()
    if (!lastTag) throw new Error('No tags')
    const log = await $`git log ${lastTag}..HEAD --oneline`.text()
    return log.trim().split('\n').filter(Boolean)
  } catch {
    // No tags yet, get all commits
    const log = await $`git log --oneline -50`.text()
    return log.trim().split('\n').filter(Boolean)
  }
}

export async function getCurrentBranch(): Promise<string> {
  return (await $`git branch --show-current`.text()).trim()
}

export async function hasUncommittedChanges(): Promise<boolean> {
  const status = await $`git status --porcelain`.text()
  return status.trim().length > 0
}

export async function commitRelease(
  files: string[],
  message: string,
  tags: string | string[],
): Promise<void> {
  await $`git add ${files}`
  await $`git commit -m ${message}`
  const tagList = Array.isArray(tags) ? tags : [tags]
  for (const tag of tagList) {
    await $`git tag ${tag}`
  }
}

export async function pushWithTags(branch: string): Promise<void> {
  await $`git push origin ${branch} --tags`
}

export async function createGitHubRelease(
  tag: string,
  notes?: string,
): Promise<void> {
  if (notes) {
    await $`gh release create ${tag} --notes ${notes}`
  } else {
    await $`gh release create ${tag} --generate-notes`
  }
}

export async function isGitRepo(): Promise<boolean> {
  try {
    await $`git rev-parse --is-inside-work-tree`.quiet()
    return true
  } catch {
    return false
  }
}

export async function hasGhCli(): Promise<boolean> {
  try {
    await $`gh --version`.quiet()
    return true
  } catch {
    return false
  }
}
