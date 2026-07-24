const STORAGE_KEY = 'vphim.proxy-mode'

const isBrowser = () => typeof window !== 'undefined'

export const getProxyModeStorage = () => {
  if (!isBrowser()) return false

  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export const setProxyModeStorage = (enabled: boolean) => {
  if (!isBrowser()) return
  window.localStorage.setItem(STORAGE_KEY, String(enabled))
}
