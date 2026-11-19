import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [unreadAlerts, setUnreadAlerts] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const me = await api.me()
      setUser(me.user || null)
      if (me.user) {
        try {
          const alerts = await api.alerts()
          setUnreadAlerts(alerts.unread || 0)
        } catch {
          setUnreadAlerts(0)
        }
      } else {
        setUnreadAlerts(0)
      }
    } catch {
      setUser(null)
      setUnreadAlerts(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
    setUnreadAlerts(0)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: Boolean(user?.is_admin),
      unreadAlerts,
      refresh,
      setUnreadAlerts,
      logout,
      loginUrl: api.loginUrl(),
    }),
    [user, loading, unreadAlerts, refresh, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
