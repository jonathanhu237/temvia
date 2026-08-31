const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

let setupAuthority: string | undefined

export function isCanonicalSetupAuthority(value: string): boolean {
  return TOKEN_PATTERN.test(value)
}

export function captureSetupAuthority(
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
  history: Pick<History, 'state' | 'replaceState'> = window.history,
): string | undefined {
  setupAuthority = undefined
  if (location.pathname !== '/setup') return undefined

  const hasFragment = location.hash.length > 0
  let candidate: string | undefined
  if (hasFragment) {
    try {
      const fragment = location.hash.slice(1)
      const params = new URLSearchParams(fragment)
      const tokens = params.getAll('token')
      const entries = [...params.keys()]
      if (tokens.length === 1 && entries.length === 1 && isCanonicalSetupAuthority(tokens[0])) {
        candidate = tokens[0]
      }
    } catch {
      candidate = undefined
    }
    history.replaceState(history.state, '', `${location.pathname}${location.search}`)
  }

  setupAuthority = candidate
  return candidate
}

export function getSetupAuthority(): string | undefined {
  return setupAuthority
}

export function clearSetupAuthority(): void {
  setupAuthority = undefined
}

