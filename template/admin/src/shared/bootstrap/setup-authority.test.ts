import { describe, expect, it } from 'vitest'
import {
  captureSetupAuthority,
  clearSetupAuthority,
  getSetupAuthority,
  isCanonicalSetupAuthority,
} from './setup-authority'

const token = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-'.slice(0, 43)

function location(hash: string, pathname = '/setup') {
  return { pathname, search: '?from=log', hash }
}

describe('setup URL authority', () => {
  it('captures a canonical token and replaces the fragment before rendering', () => {
    let replaced = ''
    const result = captureSetupAuthority(location(`#token=${token}`), {
      state: { from: 'test' },
      replaceState: (_state, _title, url) => { replaced = String(url) },
    })

    expect(result).toBe(token)
    expect(getSetupAuthority()).toBe(token)
    expect(replaced).toBe('/setup?from=log')
    expect(isCanonicalSetupAuthority(token)).toBe(true)
  })

  it('rejects malformed or ambiguous fragments and keeps no credential', () => {
    for (const hash of ['', '#token=short', `#token=${token}&token=${token}`, `#token=${token}&next=/login`, '#token=%ZZ']) {
      const replaced: string[] = []
      const result = captureSetupAuthority(location(hash), {
        state: null,
        replaceState: (_state, _title, url) => replaced.push(String(url)),
      })
      expect(result).toBeUndefined()
      expect(getSetupAuthority()).toBeUndefined()
      if (hash) expect(replaced).toEqual(['/setup?from=log'])
    }
  })

  it('clears the in-memory value when leaving the setup flow', () => {
    captureSetupAuthority(location(`#token=${token}`), {
      state: null,
      replaceState: () => undefined,
    })
    captureSetupAuthority(location('', '/login'), {
      state: null,
      replaceState: () => undefined,
    })
    expect(getSetupAuthority()).toBeUndefined()
    clearSetupAuthority()
  })
})
