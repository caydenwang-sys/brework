'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Notification = {
  id: number
  user_id: string
  type: string
  title: string
  message: string
  related_user_id: string | null
  related_match_id: number | null
  related_message_id: string | null
  is_read: boolean
  created_at: string
}

export default function NotificationsPage() {
  const router = useRouter()

  const [userId, setUserId] = useState('')
  const [notifications, setNotifications] =
    useState<Notification[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [visibleCount, setVisibleCount] = useState(20)
  const initialReadDone = useRef(false)
  const [newOnThisVisit, setNewOnThisVisit] = useState<Set<number>>(() => new Set())
  const [historyCutoff] = useState(() => Date.now() - 30 * 24 * 60 * 60 * 1000)

  const groupedNotifications = useMemo(() => {
    const groups = new Map<string, { notification: Notification; unreadCount: number; unread: boolean }>()
    const sorted = [...notifications].sort((a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
    for (const notification of sorted) {
      // Old unread items remain available; read history is hidden, never deleted.
      if (notification.is_read && Date.parse(notification.created_at) < historyCutoff) continue
      const isMessage = notification.type === 'message' || notification.type === 'new_message'
      const key = isMessage && (notification.related_user_id || notification.related_match_id)
        ? `message:${notification.related_user_id || notification.related_match_id}`
        : `notification:${notification.id}`
      const group = groups.get(key)
      if (group) { if (!notification.is_read || newOnThisVisit.has(notification.id)) group.unreadCount++; group.unread ||= !notification.is_read }
      else groups.set(key, { notification, unreadCount: !notification.is_read || newOnThisVisit.has(notification.id) ? 1 : 0, unread: !notification.is_read })
    }
    return [...groups.values()]
  }, [notifications, historyCutoff, newOnThisVisit])

  // ============================================
  // LOAD NOTIFICATIONS
  // ============================================

  async function loadNotifications(
    currentUserId: string
  ) {
    const supabase = createClient()

    // Fetch in pages so Supabase's row limit cannot silently cut off history.
    const collected: Notification[] = []
    const cutoff = new Date(historyCutoff).toISOString()
    for (let offset = 0; ; offset += 500) {
      const { data, error: notificationError } = await supabase
        .from('notifications').select('*').eq('user_id', currentUserId)
        .or(`is_read.eq.false,created_at.gte.${cutoff}`)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(offset, offset + 499)
      if (notificationError) {
        setError(`Could not load notifications: ${notificationError.message}`)
        return
      }
      const rows = (data || []) as Notification[]
      collected.push(...rows)
      if (rows.length < 500) break
    }
    // Merge rather than overwrite arrivals received while the query was running.
    setNotifications(current => {
      const loaded = new Map(collected.map(item => [item.id, item]))
      for (const item of current) if (!loaded.has(item.id)) loaded.set(item.id, item)
      return [...loaded.values()]
    })
    // Reading the bell clears the opening snapshot only. Later arrivals stay unread.
    if (!initialReadDone.current) {
      initialReadDone.current = true
      const ids = collected.filter(item => !item.is_read).map(item => item.id)
      setNewOnThisVisit(current => new Set([...current, ...ids]))
      const readIds = new Set<number>()
      for (let offset = 0; offset < ids.length; offset += 200) {
        const batch = ids.slice(offset, offset + 200)
        const { error: updateError } = await supabase.from('notifications')
          .update({ is_read: true }).eq('user_id', currentUserId).in('id', batch)
        if (updateError) {
          setError(`Could not mark notifications read: ${updateError.message}. Reopen Notifications to try again.`)
          break
        }
        batch.forEach(id => readIds.add(id))
      }
      if (readIds.size) {
        setNotifications(current => current.map(item => readIds.has(item.id) ? { ...item, is_read: true } : item))
        window.dispatchEvent(new Event('brework:notifications-changed'))
      }
    }
  }

  // ============================================
  // INITIAL LOAD
  // ============================================

  useEffect(() => {
    let mounted = true

    async function initialize() {
      setLoading(true)
      setError('')

      const supabase = createClient()

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        router.push('/login')
        return
      }

      if (!mounted) {
        return
      }

      setUserId(user.id)

      await loadNotifications(user.id)

      if (mounted) {
        setLoading(false)
      }
    }

    initialize()

    return () => {
      mounted = false
    }
  }, [router])

  // ============================================
  // REALTIME NOTIFICATIONS
  // ============================================

  useEffect(() => {
    if (!userId) {
      return
    }

    const supabase = createClient()

    console.log(
      'Starting notification realtime listener for:',
      userId
    )

    // IMPORTANT:
    // We intentionally do NOT use a Realtime filter here.
    //
    // Instead, we receive INSERT events from the
    // notifications table and check user_id locally.
    //
    // This avoids problems with filtered Postgres
    // Changes subscriptions while still ensuring
    // that only this user's notifications are shown.

    const channel = supabase
      .channel(
        `notifications-${userId}-${Date.now()}`
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          console.log(
            '🔔 REALTIME NOTIFICATION RECEIVED:',
            payload
          )

          const newNotification =
            payload.new as Notification

          // ==========================================
          // ONLY ACCEPT THIS USER'S NOTIFICATIONS
          // ==========================================

          if (
            newNotification.user_id !==
            userId
          ) {
            console.log(
              'Ignoring notification for another user'
            )

            return
          }

          // ==========================================
          // ADD TO UI
          // ==========================================

          setNotifications((current) => {
            const alreadyExists =
              current.some(
                (notification) =>
                  notification.id ===
                  newNotification.id
              )

            if (alreadyExists) {
              return current
            }

            console.log(
              '✅ Adding new notification to UI:',
              newNotification
            )

            return [
              newNotification,
              ...current,
            ]
          })
        }
      )
      .subscribe((status, err) => {
        console.log(
          '🔔 Notification realtime status:',
          status
        )

        if (status === 'SUBSCRIBED') {
          console.log(
            '✅ Notification realtime successfully connected'
          )
        }

        if (status === 'CHANNEL_ERROR') {
          console.error(
            '❌ Notification realtime channel error:',
            err
          )

          setError(
            'Realtime notifications are temporarily unavailable. Refreshing may be required.'
          )
        }

        if (status === 'TIMED_OUT') {
          console.error(
            '❌ Notification realtime connection timed out'
          )
        }

        if (status === 'CLOSED') {
          console.log(
            'Notification realtime channel closed'
          )
        }
      })

    // ============================================
    // CLEANUP
    // ============================================

    return () => {
      console.log(
        'Removing notification realtime listener'
      )

      supabase.removeChannel(channel)
    }
  }, [userId])

  // ============================================
  // MARK AS READ
  // ============================================

  async function markAsRead(
    notificationIds: number[]
  ) {
    setError('')

    const supabase = createClient()

    const { error: updateError } =
      await supabase
        .from('notifications')
        .update({
          is_read: true,
        })
        .in('id', notificationIds)
        .eq('user_id', userId)

    if (updateError) {
      console.error(
        'Could not mark notification as read:',
        updateError
      )

      setError(
        `Could not mark notification as read: ${updateError.message}`
      )

      return
    }

    window.dispatchEvent(new Event('brework:notifications-changed'))

    setNotifications((current) =>
      current.map((notification) =>
        notificationIds.includes(notification.id)
          ? {
              ...notification,
              is_read: true,
            }
          : notification
      )
    )
  }

  // ============================================
  // HANDLE NOTIFICATION CLICK
  // ============================================

  async function handleNotificationClick(
    notification: Notification
  ) {
    {
      const isMessage = notification.type === 'message' || notification.type === 'new_message'
      const ids = notifications.filter(item => !item.is_read && (
        item.id === notification.id || (isMessage &&
          (item.type === 'message' || item.type === 'new_message') &&
          (notification.related_user_id
            ? item.related_user_id === notification.related_user_id
            : notification.related_match_id !== null && item.related_match_id === notification.related_match_id))
      )).map(item => item.id)
      for (let offset = 0; offset < ids.length; offset += 200) await markAsRead(ids.slice(offset, offset + 200))
    }

    // ==========================================
    // NEW MESSAGE
    // ==========================================

    if (
      notification.type === 'message' ||
      notification.type === 'new_message'
    ) {
      if (notification.related_match_id) {
        router.push(
          `/chats/conversation?matchId=${notification.related_match_id}`
        )
      } else {
        router.push('/chats')
      }

      return
    }

    if (notification.type.startsWith('coffee_chat_') && notification.type !== 'coffee_chat_request') {
      router.push('/coffee-chats?view=calendar')
      return
    }

    // ==========================================
    // CONNECTION REQUEST
    // ==========================================

    if (
      notification.type ===
        'connection_request' ||
      notification.type ===
        'new_connection_request'
    ) {
      router.push('/connections')
      return
    }

    // ==========================================
    // COFFEE CHAT REQUEST
    // ==========================================

    if (
      notification.type ===
      'coffee_chat_request'
    ) {
      router.push(
        '/coffee-chats?view=calendar#requests'
      )

      return
    }

    // ==========================================
    // COFFEE CHAT ACCEPTED
    // ==========================================

    if (
      notification.type ===
      'coffee_chat_accepted'
    ) {
      if (notification.related_match_id) {
        router.push(
          '/coffee-chats?view=calendar'
        )
      } else {
        router.push('/coffee-chats?view=calendar')
      }

      return
    }

    // ==========================================
    // COFFEE CHAT DECLINED
    // ==========================================

    if (
      notification.type ===
      'coffee_chat_declined'
    ) {
      if (notification.related_match_id) {
        router.push(
          '/coffee-chats?view=calendar'
        )
      } else {
        router.push('/coffee-chats?view=calendar')
      }

      return
    }

    // ==========================================
    // CONNECTION ACCEPTED
    // ==========================================

    if (
      notification.type ===
      'connection_accepted'
    ) {
      if (notification.related_match_id) {
        router.push(
          '/connections'
        )
      } else {
        router.push('/connections')
      }

      return
    }

    // ==========================================
    // NEW MATCH
    // ==========================================

    if (
      notification.type ===
      'new_match'
    ) {
      router.push('/connections')
      return
    }
  }

  // ============================================
  // FORMAT TIME
  // ============================================

  function formatNotificationTime(
    dateString: string
  ) {
    const date = new Date(dateString)

    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  // ============================================
  // ICON
  // ============================================

  function getNotificationIcon(
    type: string
  ) {
    switch (type) {
      case 'coffee_chat_request':
        return '☕'

      case 'coffee_chat_accepted':
        return '✅'

      case 'coffee_chat_declined':
        return '❌'

      case 'message':
      case 'new_message':
        return '💬'

      case 'new_match':
        return '🤝'

      case 'connection_accepted':
        return '🤝'

      default:
        return '🔔'
    }
  }

  // ============================================
  // LOADING
  // ============================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">

        <div className="text-center">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
            🔔
          </div>

          <p className="mt-4 text-sm font-medium text-gray-500">
            Loading notifications...
          </p>

        </div>

      </main>
    )
  }

  const unreadCount =
    notifications.filter(
      (notification) =>
        !notification.is_read
    ).length

  // ============================================
  // PAGE
  // ============================================

  return (
    <main className="min-h-screen bg-[#f7f7f5] pb-24">

      {/* ======================================== */}
      {/* HEADER */}
      {/* ======================================== */}

      <header className="border-b border-gray-200/70 bg-white">

        <div className="mx-auto max-w-2xl px-6 py-6">

          <button
            onClick={() => router.back()}
            className="mb-5 text-sm text-gray-500 transition hover:text-black"
          >
            ← Back
          </button>

          <div className="flex items-center justify-between gap-4">

            <div>

              <h1 className="text-3xl font-bold tracking-tight">
                Notifications
              </h1>

              <p className="mt-2 text-sm text-gray-500">
                Stay up to date with your Brework
                activity.
              </p>

            </div>

            {unreadCount > 0 && (
              <span className="rounded-full bg-black px-3 py-1 text-xs font-bold text-white">
                {unreadCount} new
              </span>
            )}

          </div>

        </div>

      </header>

      <div className="mx-auto max-w-2xl px-5">

        {/* ====================================== */}
        {/* ERROR */}
        {/* ====================================== */}

        {error && (
          <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* ====================================== */}
        {/* NOTIFICATIONS */}
        {/* ====================================== */}

        <section className="mt-5">

          {groupedNotifications.length === 0 ? (

            <div className="rounded-3xl border border-gray-200/70 bg-white p-10 text-center shadow-sm">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 text-4xl">
                🔔
              </div>

              <h2 className="mt-5 text-xl font-bold">
                No notifications yet
              </h2>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
                When something happens on Brework,
                you&apos;ll see it here.
              </p>

            </div>

          ) : (

            <div className="space-y-3">

              {groupedNotifications.slice(0, visibleCount).map(
                ({ notification, unreadCount, unread }) => (

                  <button
                    key={notification.id}
                    onClick={() =>
                      handleNotificationClick(
                        notification
                      )
                    }
                    className={`w-full rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-50 ${
                      !unread
                        ? 'border-gray-200/70 bg-white'
                        : 'border-blue-200 bg-blue-50/50'
                    }`}
                  >

                    <div className="flex gap-4">

                      {/* ICON */}

                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                          !unread
                            ? 'bg-gray-100'
                            : 'bg-white'
                        }`}
                      >
                        <span className="text-xl">
                          {getNotificationIcon(
                            notification.type
                          )}
                        </span>
                      </div>

                      {/* CONTENT */}

                      <div className="min-w-0 flex-1">

                        <div className="flex items-start justify-between gap-3">

                          <p className="font-semibold">
                            {(notification.type === 'message' || notification.type === 'new_message') && unreadCount > 0
                              ? `${notification.title === 'New message' ? 'Someone' : notification.title}: ${unreadCount} new ${unreadCount === 1 ? 'message' : 'messages'}`
                              : notification.title}
                          </p>

                          {unread && (
                            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
                          )}

                        </div>

                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-600">
                          {notification.message}
                        </p>

                        <p className="mt-2 text-xs text-gray-400">
                          {formatNotificationTime(
                            notification.created_at
                          )}
                        </p>

                      </div>

                    </div>

                  </button>

                )
              )}

            </div>

          )}

        </section>

        {visibleCount < groupedNotifications.length && (
          <button type="button" onClick={() => setVisibleCount(current => current + 20)}
            className="mt-5 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold">
            Load older notifications
          </button>
        )}
        <p className="mt-5 text-center text-xs text-gray-500">
          Messages are grouped by sender. Read notifications older than 30 days are hidden.
        </p>

      </div>

    </main>
  )
}