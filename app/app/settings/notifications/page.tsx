'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

function NotificationSwitch({ checked, label, onToggle, disabled }: {
  checked: boolean
  label: string
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className="disabled:cursor-wait disabled:opacity-70 flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
    >
      <span className="w-7 text-xs font-bold">{checked ? 'On' : 'Off'}</span>
      <span
        aria-hidden="true"
        className="relative block h-8 w-14 rounded-full border-2 transition-colors"
        style={{ backgroundColor: checked ? '#15803d' : '#64748b', borderColor: checked ? '#15803d' : '#64748b' }}
      >
        <span
          className="absolute top-0.5 block h-6 w-6 rounded-full shadow-sm transition-transform"
          style={{ backgroundColor: '#ffffff', left: '2px', transform: checked ? 'translateX(24px)' : 'translateX(0)' }}
        />
      </span>
    </button>
  )
}

export default function NotificationSettingsPage() {
  const router = useRouter()

  const [messageNotifications, setMessageNotifications] = useState(true)
  const [
    coffeeChatRequestNotifications,
    setCoffeeChatRequestNotifications,
  ] = useState(true)

  const [coffeeChatReminders, setCoffeeChatReminders] = useState(false)
  const [reminderMinutes, setReminderMinutes] = useState(30)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  const saveLock = useRef(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function loadPreferences() {
      const supabase = createClient()

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        router.push('/login')
        return
      }

      const {
        data,
        error: preferencesError,
      } = await supabase
        .from('notification_preferences')
        .select(`
          message_notifications,
          coffee_chat_request_notifications,
          coffee_chat_reminders_enabled,
          coffee_chat_reminder_minutes
        `)
        .eq('user_id', user.id)
        .maybeSingle()

      if (preferencesError) {
        setError(
          `Could not load notification preferences: ${preferencesError.message}`
        )
        setLoading(false)
        return
      }

      if (data) {
        setMessageNotifications(data.message_notifications)
        setCoffeeChatRequestNotifications(
          data.coffee_chat_request_notifications
        )
      }

      if (data) {
        setCoffeeChatReminders(data.coffee_chat_reminders_enabled === true)
        setReminderMinutes([15, 30, 60, 1440].includes(data.coffee_chat_reminder_minutes)
          ? data.coffee_chat_reminder_minutes : 30)
      }
      setReady(true)
      setLoading(false)
    }

    loadPreferences()
  }, [router])

  type PreferenceField = 'message_notifications' | 'coffee_chat_request_notifications'
    | 'coffee_chat_reminders_enabled' | 'coffee_chat_reminder_minutes'

  function applyPreference(field: PreferenceField, value: boolean | number) {
    if (field === 'message_notifications') setMessageNotifications(Boolean(value))
    else if (field === 'coffee_chat_request_notifications') setCoffeeChatRequestNotifications(Boolean(value))
    else if (field === 'coffee_chat_reminders_enabled') setCoffeeChatReminders(Boolean(value))
    else setReminderMinutes(Number(value))
  }

  async function savePreference(field: PreferenceField, next: boolean | number) {
    if (saveLock.current || !ready) return
    if (field === 'coffee_chat_reminder_minutes' && ![15, 30, 60, 1440].includes(Number(next))) return
    const values = {
      message_notifications: messageNotifications,
      coffee_chat_request_notifications: coffeeChatRequestNotifications,
      coffee_chat_reminders_enabled: coffeeChatReminders,
      coffee_chat_reminder_minutes: reminderMinutes,
    }
    const previous = values[field]
    if (previous === next) return
    saveLock.current = true
    setSaving(true)
    setError('')
    setSuccess('')
    applyPreference(field, next)

    try {
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        applyPreference(field, previous)
        router.push('/login')
        return
      }
      const { error: saveError } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          ...values,
          [field]: next,
          updated_at: new Date().toISOString(),
        })
        .select('user_id')
        .single()
      if (saveError) throw saveError
      setSuccess('Saved automatically.')
    } catch (cause) {
      applyPreference(field, previous)
      const message = cause && typeof cause === 'object' && 'message' in cause
        ? String(cause.message) : 'Please check your connection and try again.'
      setError(`Could not save notification preferences: ${message} Your previous setting was restored. Please try again.`)
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }

  function togglePreference(field: 'message_notifications' | 'coffee_chat_request_notifications') {
    return savePreference(field, !(field === 'message_notifications' ? messageNotifications : coffeeChatRequestNotifications))
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
        <p className="text-sm text-gray-500">
          Loading notification preferences...
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5]">

      <header className="sticky top-0 z-20 border-b border-gray-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4 sm:px-6">

          <button
            type="button"
            disabled={saving}
            onClick={() => router.push('/settings')}
            className="text-xl font-bold tracking-tight"
          >
            Brework
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => router.push('/settings')}
            className="rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-black"
          >
            Back
          </button>

        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-12">

        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
          Notifications
        </p>

        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          Notification preferences
        </h1>

        <p className="mt-3 max-w-xl text-gray-500">
          Choose which Brework activity should create notifications for you.
        </p>

        {error && (
          <div role="alert" className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {success && (
          <div role="status" className="mt-6 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-700">
            {success}
          </div>
        )}

        <section className="mt-10 rounded-3xl border border-gray-200/70 bg-white p-6 shadow-sm">

          <div className="flex items-center justify-between gap-3">

            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">
                Message notifications
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Get notified when another student sends you a message.
              </p>
            </div>

            <NotificationSwitch
              checked={messageNotifications}
              label="Message notifications"
              disabled={saving || !ready}
              onToggle={() => { void togglePreference('message_notifications') }}
            />

          </div>

          <div className="my-6 border-t border-gray-100" />

          <div className="flex items-center justify-between gap-3">

            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">
                Coffee chat request notifications
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Get notified when another student sends you a coffee chat request.
              </p>
            </div>

            <NotificationSwitch
              checked={coffeeChatRequestNotifications}
              label="Coffee chat request notifications"
              disabled={saving || !ready}
              onToggle={() => { void togglePreference('coffee_chat_request_notifications') }}
            />

          </div>

          <div className="my-6 border-t border-gray-100" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Coffee chat reminders</h2>
              <p className="mt-1 text-sm text-gray-500">Send a phone push notification before your confirmed coffee chats, even when Brework is closed.</p>
            </div>
            <NotificationSwitch checked={coffeeChatReminders} label="Coffee chat reminders"
              disabled={saving || !ready} onToggle={() => { void savePreference('coffee_chat_reminders_enabled', !coffeeChatReminders) }} />
          </div>
          <div className="mt-5">
            <label htmlFor="coffee-reminder-time" className="block text-sm font-semibold">Remind me</label>
            <select id="coffee-reminder-time" value={reminderMinutes}
              disabled={saving || !ready || !coffeeChatReminders}
              onChange={event => { void savePreference('coffee_chat_reminder_minutes', Number(event.target.value)) }}
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base disabled:opacity-50">
              <option value={15}>15 minutes before</option>
              <option value={30}>30 minutes before</option>
              <option value={60}>1 hour before</option>
              <option value={1440}>1 day before</option>
            </select>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">Phone notifications must be allowed for Brework. Reminders follow the meeting&apos;s Pacific time and may arrive about a minute after the selected reminder time. If a chat is confirmed closer to its start, the reminder arrives shortly after confirmation.</p>
          </div>
        </section>

        <p role="status" aria-live="polite" className="mt-6 text-sm text-gray-500">
          {saving ? 'Saving…' : !error && !success ? 'Changes save automatically.' : ''}
        </p>

      </div>

    </main>
  )
}