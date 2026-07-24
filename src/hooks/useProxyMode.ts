import { useCallback, useState } from 'react'
import { getProxyModeStorage, setProxyModeStorage } from 'src/storage/proxy-mode.storage'

export default function useProxyMode() {
  const [proxyMode, setProxyMode] = useState<boolean>(() => getProxyModeStorage())

  const updateProxyMode = useCallback((enabled: boolean) => {
    setProxyMode(enabled)
    setProxyModeStorage(enabled)
  }, [])

  const toggleProxyMode = useCallback(() => {
    setProxyMode((previous) => {
      const nextValue = !previous
      setProxyModeStorage(nextValue)
      return nextValue
    })
  }, [])

  return {
    proxyMode,
    setProxyMode: updateProxyMode,
    toggleProxyMode
  }
}
