'use client'

import { useEffect, useState } from 'react'
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
  const [markingAll, setMarkingAll] = useState(false)

  // ============================================
  // LOAD NOTIFICATIONS
  // ============================================

  async function loadNotifications(
    currentUserId: string
  ) {
    const supabase = createClient()

    const {
      data,
      error: notificationError,
    } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', currentUserId)
      .order('created_at', {
        ascending: false,
      })

    if (notificationError) {
      console.error(
        'Could not load notifications:',
        notificationError
      )

      setError(
        `Could not load notifications: ${notificationError.message}`
      )

      return
    }

    setNotifications(
      (data || []) as Notification[]
    )
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
    notificationId: number
  ) {
    setError('')

    const supabase = createClient()

    const { error: updateError } =
      await supabase
        .from('notifications')
        .update({
          is_read: true,
        })
        .eq('id', notificationId)
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
        notification.id === notificationId
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
    if (!notification.is_read) {
      await markAsRead(notification.id)
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
          `/schedule?match=${notification.related_match_id}`
        )
      } else {
        router.push('/schedule')
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
          `/schedule?match=${notification.related_match_id}`
        )
      } else {
        router.push('/schedule')
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
          `/schedule?match=${notification.related_match_id}`
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
  // MARK ALL AS READ
  // ============================================

  async function markAllAsRead() {
    if (markingAll) {
      return
    }

    const unreadIds = notifications
      .filter(
        (notification) =>
          !notification.is_read
      )
      .map(
        (notification) =>
          notification.id
      )

    if (unreadIds.length === 0) {
      return
    }

    setMarkingAll(true)
    setError('')

    const supabase = createClient()

    const { error: updateError } =
      await supabase
        .from('notifications')
        .update({
          is_read: true,
        })
        .eq('user_id', userId)
        .in('id', unreadIds)

    if (updateError) {
      console.error(
        'Could not mark notifications as read:',
        updateError
      )

      setError(
        `Could not mark notifications as read: ${updateError.message}`
      )

      setMarkingAll(false)
      return
    }

    window.dispatchEvent(new Event('brework:notifications-changed'))

    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        is_read: true,
      }))
    )

    setMarkingAll(false)
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
        {/* MARK ALL */}
        {/* ====================================== */}

        {unreadCount > 0 && (
          <div className="mt-5 flex justify-end">

            <button
              onClick={markAllAsRead}
              disabled={markingAll}
              className="text-sm font-semibold text-gray-600 underline transition hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {markingAll
                ? 'Marking as read...'
                : 'Mark all as read'}
            </button>

          </div>
        )}

        {/* ====================================== */}
        {/* NOTIFICATIONS */}
        {/* ====================================== */}

        <section className="mt-5">

          {notifications.length === 0 ? (

            <div className="rounded-3xl border border-gray-200/70 bg-white p-10 text-center shadow-sm">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 text-4xl">
                🔔
              </div>

              <h2 className="mt-5 text-xl font-bold">
                No notifications yet
              </h2>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
                When something happens on Brework,
                you'll see it here.
              </p>

            </div>

          ) : (

            <div className="space-y-3">

              {notifications.map(
                (notification) => (

                  <button
                    key={notification.id}
                    onClick={() =>
                      handleNotificationClick(
                        notification
                      )
                    }
                    className={`w-full rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-50 ${
                      notification.is_read
                        ? 'border-gray-200/70 bg-white'
                        : 'border-blue-200 bg-blue-50/50'
                    }`}
                  >

                    <div className="flex gap-4">

                      {/* ICON */}

                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                          notification.is_read
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
                            {notification.title}
                          </p>

                          {!notification.is_read && (
                            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
                          )}

                        </div>

                        <p className="mt-1 text-sm leading-6 text-gray-600">
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

      </div>

    </main>
  )
}