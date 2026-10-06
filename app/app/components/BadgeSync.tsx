'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { PushNotifications } from '@capacitor/push-notifications'
import { Badge } from '@capawesome/capacitor-badge'
import { createClient } from '@/lib/supabase/client'

export default function BadgeSync() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'ios') return
    const supabase = createClient()
    let active = true
    let userId: string | null = null
    let authVersion = 0
    let dirty = false
    let running = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let channel: ReturnType<typeof supabase.channel> | null = null
    const listeners: Array<{ remove: () => Promise<void> }> = []

    async function sync() {
      dirty = true
      if (running || !active) return
      running = true
      try {
        while (active && dirty) {
          dirty = false
          const version = authVersion
          const owner = userId
          let count = 0
          if (owner) {
            const result = await supabase.from('notifications')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', owner).eq('is_read', false)
            if (result.error) {
              console.error('Could not load badge count:', result.error)
              continue // Keep the existing badge if the connection fails.
            }
            count = result.count ?? 0
          }
          if (!active || version !== authVersion) continue
          await Badge.set({ count })
        }
      } catch (error) {
        console.error('Could not update app badge:', error)
      } finally {
        running = false
      }
    }

    function queueSync() {
      if (!active) return
      clearTimeout(timer)
      timer = setTimeout(() => { if (active) void sync() }, 150)
    }

    function changeUser(nextId: string | null) {
      if (!active) return
      if (nextId !== userId) {
        authVersion += 1
        userId = nextId
        if (channel) void supabase.removeChannel(channel)
        channel = nextId ? supabase.channel(`icon-badge-${nextId}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'notifications',
            filter: `user_id=eq.${nextId}`,
          }, queueSync)
          .subscribe(status => { if (status === 'SUBSCRIBED') queueSync() }) : null
      }
      queueSync()
    }

    // Defer work outside the auth callback to avoid blocking Supabase auth.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      changeUser(session?.user.id ?? null)
    })

    async function keepListener(promise: Promise<{ remove: () => Promise<void> }>) {
      const listener = await promise
      if (active) listeners.push(listener)
      else await listener.remove()
    }

    async function start() {
      try {
        await keepListener(App.addListener('appStateChange', state => {
          if (state.isActive) queueSync()
        }))
        await keepListener(PushNotifications.addListener('pushNotificationReceived', queueSync))
        const version = authVersion
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) { console.error('Could not initialize badge:', error); return }
        if (active && version === authVersion) changeUser(user?.id ?? null)
      } catch (error) {
        console.error('Badge setup failed:', error)
      }
    }

    window.addEventListener('brework:notifications-changed', queueSync)
    void start()
    return () => {
      active = false
      clearTimeout(timer)
      subscription.unsubscribe()
      window.removeEventListener('brework:notifications-changed', queueSync)
      if (channel) void supabase.removeChannel(channel)
      for (const listener of listeners) void listener.remove()
    }
  }, [])
  return null
}
