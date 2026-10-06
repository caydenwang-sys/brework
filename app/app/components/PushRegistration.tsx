'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { createClient } from '@/lib/supabase/client'
import BadgeSync from './BadgeSync'

export default function PushRegistration() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const supabase = createClient()
    let active = true
    let deviceToken: string | null = null
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
        listeners.push(await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          () => window.location.assign('/notifications')
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
      subscription.unsubscribe()
      for (const listener of listeners) void listener.remove()
    }
  }, [])
  return <BadgeSync />
}
