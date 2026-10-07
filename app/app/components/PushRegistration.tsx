'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { createClient } from '@/lib/supabase/client'
import BadgeSync from './BadgeSync'

export default function PushRegistration() {
  const router = useRouter()
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const supabase = createClient()
    let active = true
    let deviceToken: string | null = null
    let navigationVersion = 0
    let markerTimer: ReturnType<typeof setTimeout> | undefined

    async function openNotification(data: Record<string, unknown>) {
      const version = ++navigationVersion
      // Set synchronously so Home's outstanding session check cannot override us.
      try { sessionStorage.setItem('brework:push-navigation', String(Date.now())) } catch {}
      function navigate(path: string) {
        if (!active || version !== navigationVersion) return
        router.push(path)
        if (markerTimer) clearTimeout(markerTimer)
        markerTimer = setTimeout(() => {
          try { sessionStorage.removeItem('brework:push-navigation') } catch {}
        }, 2000)
      }
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (!active || version !== navigationVersion) return
        if (error || !user) { navigate('/login'); return }
        const { data: profile, error: profileError } = await supabase.from('profiles')
          .select('onboarding_completed_at').eq('id', user.id).maybeSingle()
        if (profileError) throw profileError
        if (!profile?.onboarding_completed_at) { navigate('/onboarding'); return }
        const id = String(data.notification_id ?? '')
        if (!/^[0-9]+$/.test(id)) { navigate('/notifications'); return }
        // Resolve the trusted record for the signed-in recipient, including old pushes.
        const { data: notification, error: notificationError } = await supabase.from('notifications')
          .select('type').eq('id', id).eq('user_id', user.id).maybeSingle()
        if (notificationError) throw notificationError
        if (!notification) { navigate('/notifications'); return }
        const type = String(notification.type)
        if (type === 'message' || type === 'new_message') navigate('/chats')
        else if (type.startsWith('connection_') || type === 'new_connection_request' || type === 'new_match') navigate('/connections')
        else if (type.startsWith('coffee_chat_')) navigate(type === 'coffee_chat_request' || type === 'coffee_chat_counterproposal'
          ? '/coffee-chats?view=calendar#requests' : '/coffee-chats?view=calendar')
        else navigate('/notifications')
      } catch (cause) {
        console.error('Could not open notification:', cause)
        navigate('/notifications')
      }
    }
    const listeners: Array<{ remove: () => Promise<void> }> = []

    async function saveToken(token: string) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!active || !user) return
      const { error } = await supabase.rpc('register_push_token', { p_token: token })
      if (error) console.error('Push save failed:', error)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user && deviceToken) {
          setTimeout(() => {
            if (active && deviceToken) void saveToken(deviceToken)
          }, 0)
        }
      }
    )

    async function start() {
      try {
        // Install the tap listener first, including taps queued during cold startup.
        const tapListener = await PushNotifications.addListener('pushNotificationActionPerformed', action => {
          void openNotification((action.notification.data || {}) as Record<string, unknown>)
        })
        if (!active) { await tapListener.remove(); return }
        listeners.push(tapListener)
        listeners.push(await PushNotifications.addListener(
          'registration',
          ({ value }) => {
            deviceToken = value
            void saveToken(value)
          }
        ))
        listeners.push(await PushNotifications.addListener(
          'registrationError',
          error => console.error('Push registration failed:', error)
        ))
        if (!active) return
        let permission = await PushNotifications.checkPermissions()
        if (permission.receive === 'prompt') {
          permission = await PushNotifications.requestPermissions()
        }
        if (active && permission.receive === 'granted') {
          await PushNotifications.register()
        }
      } catch (error) {
        console.error('Push setup failed:', error)
      }
    }
    void start()
    return () => {
      active = false
      if (markerTimer) clearTimeout(markerTimer)
      subscription.unsubscribe()
      for (const listener of listeners) void listener.remove()
    }
  }, [router])
  return <BadgeSync />
}
