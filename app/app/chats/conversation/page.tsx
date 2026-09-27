'use client'

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  createClient,
} from '@/lib/supabase/client'
import {
  useRouter,
  useSearchParams,
} from 'next/navigation'

type Profile = {
  id: string
  first_name: string | null
  last_name: string | null
}

type Message = {
  id: number
  match_id: number
  sender_id: string
  message: string
  created_at: string
  read_at: string | null
}

export default function ConversationPage() {
  const router = useRouter()

  const searchParams =
    useSearchParams()

  const matchId =
    Number(searchParams.get('matchId'))

  // ============================================
  // STATE
  // ============================================

  const [currentUserId, setCurrentUserId] =
    useState('')

  const [otherUser, setOtherUser] =
    useState<Profile | null>(null)

  const [messages, setMessages] =
    useState<Message[]>([])

  const [newMessage, setNewMessage] =
    useState('')

  const [loading, setLoading] =
    useState(true)

  const [sending, setSending] =
    useState(false)

  const [error, setError] =
    useState('')

  const [messageToReport, setMessageToReport] =
    useState<Message | null>(null)

  const [reportReason, setReportReason] =
    useState('')

  const [reportDetails, setReportDetails] =
    useState('')

  const [reportLoading, setReportLoading] =
    useState(false)

  const [reportError, setReportError] =
    useState('')

  const [reportSubmitted, setReportSubmitted] =
    useState(false)

  // ============================================
  // AUTO-SCROLL REF
  // ============================================

  const messagesEndRef =
    useRef<HTMLDivElement | null>(null)

  // ============================================
  // SCROLL TO BOTTOM
  // ============================================

  function scrollToBottom(
    behavior: ScrollBehavior = 'smooth'
  ) {
    messagesEndRef.current?.scrollIntoView({
      behavior,
      block: 'end',
    })
  }

  // ============================================
  // LOAD CONVERSATION
  // ============================================

  async function loadConversation() {
    const supabase = createClient()

    setLoading(true)
    setError('')

    // ============================================
    // GET CURRENT USER
    // ============================================

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      router.push('/login')
      return
    }

    setCurrentUserId(user.id)

    // ============================================
    // LOAD MATCH
    // ============================================

    const {
      data: match,
      error: matchError,
    } = await supabase
      .from('matches')
      .select(`
        id,
        user_1_id,
        user_2_id,
        status
      `)
      .eq('id', matchId)
      .single()

    if (matchError || !match) {
      console.error(
        'Could not load match:',
        matchError
      )

      setError(
        'Could not load this conversation.'
      )

      setLoading(false)
      return
    }

    // ============================================
    // VERIFY USER IS IN MATCH
    // ============================================

    const isUserInMatch =
      match.user_1_id === user.id ||
      match.user_2_id === user.id

    if (!isUserInMatch) {
      setError(
        'You do not have access to this conversation.'
      )

      setLoading(false)
      return
    }

    // ============================================
    // REQUIRE ACTIVE MATCH
    // ============================================

    if (match.status !== 'active') {
      router.replace('/chats')
      return
    }

    // ============================================
    // FIND OTHER USER
    // ============================================

    const otherUserId =
      match.user_1_id === user.id
        ? match.user_2_id
        : match.user_1_id

    // ============================================
    // CHECK FOR BLOCK
    // ============================================

    const {
      data: blockedRelationship,
      error: blockedRelationshipError,
    } = await supabase
      .from('blocked_users')
      .select(`
        blocker_id,
        blocked_id
      `)
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${user.id})`
      )
      .maybeSingle()

    if (blockedRelationshipError) {
      console.error(
        'Could not check blocked users:',
        blockedRelationshipError
      )

      setError(
        'Could not verify this conversation.'
      )

      setLoading(false)
      return
    }

    if (blockedRelationship) {
      router.replace('/chats')
      return
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('profiles')
      .select(`
        id,
        first_name,
        last_name
      `)
      .eq('id', otherUserId)
      .single()

    if (profileError) {
      console.error(
        'Could not load profile:',
        profileError
      )

      setError(
        'Could not load the other user.'
      )

      setLoading(false)
      return
    }

    setOtherUser(profile)

    // ============================================
    // LOAD MESSAGES
    // ============================================

    const {
      data: messageData,
      error: messagesError,
    } = await supabase
      .from('messages')
      .select(`
        id,
        match_id,
        sender_id,
        message,
        created_at,
        read_at
      `)
      .eq('match_id', matchId)
      .order('created_at', {
        ascending: true,
      })

    if (messagesError) {
      console.error(
        'Could not load messages:',
        messagesError
      )

      setError(
        'Could not load your messages.'
      )

      setLoading(false)
      return
    }

    setMessages(messageData || [])

    // ============================================
    // MARK OTHER USER'S MESSAGES AS READ
    // ============================================

    const unreadMessageIds =
      (messageData || [])
        .filter(
          (message) =>
            message.sender_id !== user.id &&
            !message.read_at
        )
        .map(
          (message) => message.id
        )

    if (unreadMessageIds.length > 0) {
      const readAt =
        new Date().toISOString()

      const {
        error: readError,
      } = await supabase
        .from('messages')
        .update({
          read_at: readAt,
        })
        .in(
          'id',
          unreadMessageIds
        )

      if (readError) {
        console.error(
          'Could not mark messages as read:',
          readError
        )
      } else {
        // Update local state immediately
        setMessages(
          (currentMessages) =>
            currentMessages.map(
              (message) =>
                unreadMessageIds.includes(
                  message.id
                )
                  ? {
                      ...message,
                      read_at: readAt,
                    }
                  : message
            )
        )

        window.dispatchEvent(
          new CustomEvent(
            'brewlink:new-message'
          )
        )
      }
    }

    setLoading(false)
  }

  // ============================================
  // INITIAL LOAD
  // ============================================

  useEffect(() => {
    if (!matchId || Number.isNaN(matchId)) {
      setError(
        'Invalid conversation.'
      )

      setLoading(false)
      return
    }

    loadConversation()
  }, [matchId])

  // ============================================
  // AUTO-SCROLL WHEN MESSAGES CHANGE
  // ============================================

  useEffect(() => {
    if (loading) {
      return
    }

    const timeout =
      setTimeout(() => {
        scrollToBottom('smooth')
      }, 50)

    return () => {
      clearTimeout(timeout)
    }
  }, [messages, loading])

  // ============================================
  // REALTIME MESSAGE LISTENER
  // ============================================

  useEffect(() => {
    if (
      !matchId ||
      Number.isNaN(matchId) ||
      !currentUserId
    ) {
      return
    }

    const supabase = createClient()

    let isMounted = true

    console.log(
      `Starting realtime listener for match ${matchId}`
    )

    const channel =
      supabase
        .channel(
          `messages-match-${matchId}`
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `match_id=eq.${matchId}`,
          },
          async (payload) => {

            console.log(
              'Realtime message received:',
              payload
            )

            if (!isMounted) {
              return
            }

            const newMessage =
              payload.new as Message

            // ========================================
            // PREVENT DUPLICATES
            // ========================================

            setMessages(
              (currentMessages) => {

                if (
                  currentMessages.some(
                    (message) =>
                      message.id ===
                      newMessage.id
                  )
                ) {
                  return currentMessages
                }

                return [
                  ...currentMessages,
                  newMessage,
                ]
              }
            )

            // ========================================
            // MARK OTHER USER'S MESSAGE AS READ
            // ========================================

            if (
              newMessage.sender_id !==
              currentUserId
            ) {

              const readAt =
                new Date().toISOString()

              const {
                error: readError,
              } = await supabase
                .from('messages')
                .update({
                  read_at: readAt,
                })
                .eq(
                  'id',
                  newMessage.id
                )

              if (readError) {
                console.error(
                  'Could not mark realtime message as read:',
                  readError
                )

                return
              }

              if (!isMounted) {
                return
              }

              // ======================================
              // UPDATE LOCAL MESSAGE
              // ======================================

              setMessages(
                (currentMessages) =>
                  currentMessages.map(
                    (message) =>
                      message.id ===
                      newMessage.id
                        ? {
                            ...message,
                            read_at:
                              readAt,
                          }
                        : message
                  )
              )

              window.dispatchEvent(
                new CustomEvent(
                  'brewlink:new-message'
                )
              )

              console.log(
                'Realtime message marked as read'
              )
            }
          }
        )
        .subscribe(
          async (status) => {

            console.log(
              `Realtime status for match ${matchId}:`,
              status
            )

            if (status === 'SUBSCRIBED') {

              console.log(
                `Realtime successfully connected for match ${matchId}`
              )

              const {
                data: refreshedMessages,
                error: refreshError,
              } = await supabase
                .from('messages')
                .select(`
                  id,
                  match_id,
                  sender_id,
                  message,
                  created_at,
                  read_at
                `)
                .eq(
                  'match_id',
                  matchId
                )
                .order('created_at', {
                  ascending: true,
                })

              if (
                refreshError ||
                !refreshedMessages ||
                !isMounted
              ) {
                if (refreshError) {
                  console.error(
                    'Could not refresh messages after realtime connection:',
                    refreshError
                  )
                }

                return
              }

              setMessages(
                (currentMessages) => {

                  const messageMap =
                    new Map<number, Message>()

                  currentMessages.forEach(
                    (message) => {
                      messageMap.set(
                        message.id,
                        message
                      )
                    }
                  )

                  refreshedMessages.forEach(
                    (message) => {
                      messageMap.set(
                        message.id,
                        message
                      )
                    }
                  )

                  return Array.from(
                    messageMap.values()
                  ).sort(
                    (a, b) =>
                      new Date(
                        a.created_at
                      ).getTime() -
                      new Date(
                        b.created_at
                      ).getTime()
                  )
                }
              )
            }

            if (
              status ===
              'CHANNEL_ERROR'
            ) {
              console.error(
                `Realtime channel error for match ${matchId}`
              )
            }

            if (
              status ===
              'TIMED_OUT'
            ) {
              console.error(
                `Realtime connection timed out for match ${matchId}`
              )
            }
          }
        )

    return () => {

      isMounted = false

      console.log(
        `Removing realtime listener for match ${matchId}`
      )

      supabase.removeChannel(
        channel
      )
    }

  }, [matchId, currentUserId])

  // ============================================
  // SEND MESSAGE
  // ============================================

  async function sendMessage(
    event: FormEvent
  ) {
    event.preventDefault()

    const trimmedMessage =
      newMessage.trim()

    if (
      !trimmedMessage ||
      sending ||
      !currentUserId
    ) {
      return
    }

    const supabase = createClient()

    setSending(true)
    setError('')

    // ============================================
    // VERIFY MATCH IS STILL ACTIVE
    // ============================================

    const {
      data: activeMatch,
      error: activeMatchError,
    } = await supabase
      .from('matches')
      .select(`
        id,
        user_1_id,
        user_2_id,
        status
      `)
      .eq('id', matchId)
      .maybeSingle()

    if (
      activeMatchError ||
      !activeMatch ||
      activeMatch.status !== 'active'
    ) {
      setSending(false)
      router.replace('/chats')
      return
    }

    const otherUserId =
      activeMatch.user_1_id ===
      currentUserId
        ? activeMatch.user_2_id
        : activeMatch.user_1_id

    // ============================================
    // VERIFY USERS ARE NOT BLOCKED
    // ============================================

    const {
      data: blockedRelationship,
      error: blockedRelationshipError,
    } = await supabase
      .from('blocked_users')
      .select(`
        blocker_id,
        blocked_id
      `)
      .or(
        `and(blocker_id.eq.${currentUserId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${currentUserId})`
      )
      .maybeSingle()

    if (
      blockedRelationshipError ||
      blockedRelationship
    ) {
      setSending(false)
      router.replace('/chats')
      return
    }

    const {
      data: insertedMessage,
      error: sendError,
    } = await supabase
      .from('messages')
      .insert({
        match_id: matchId,
        sender_id: currentUserId,
        message: trimmedMessage,
      })
      .select(`
        id,
        match_id,
        sender_id,
        message,
        created_at,
        read_at
      `)
      .single()

    if (sendError) {
      console.error(
        'Could not send message:',
        sendError
      )

      setError(
        'Could not send your message. Please try again.'
      )

      setSending(false)
      return
    }

    setMessages(
      (currentMessages) => {

        if (
          currentMessages.some(
            (message) =>
              message.id ===
              insertedMessage.id
          )
        ) {
          return currentMessages
        }

        return [
          ...currentMessages,
          insertedMessage,
        ]
      }
    )

    setNewMessage('')
    setSending(false)

    setTimeout(() => {
      scrollToBottom('smooth')
    }, 50)
  }

  // ============================================
  // REPORT MESSAGE
  // ============================================

  function openReportMessage(
    message: Message
  ) {
    setMessageToReport(message)
    setReportReason('')
    setReportDetails('')
    setReportError('')
    setReportSubmitted(false)
  }

  function closeReportMessage() {
    if (reportLoading) {
      return
    }

    setMessageToReport(null)
    setReportReason('')
    setReportDetails('')
    setReportError('')
    setReportSubmitted(false)
  }

  async function handleReportMessage() {
    if (
      !messageToReport ||
      !otherUser ||
      !currentUserId ||
      !reportReason ||
      reportLoading
    ) {
      return
    }

    setReportLoading(true)
    setReportError('')

    const supabase = createClient()

    const { error: submitError } =
      await supabase.from('reports').insert({
        reporter_id: currentUserId,
        reported_user_id: otherUser.id,
        report_type: 'message',
        reason: reportReason,
        details:
          reportDetails.trim() || null,
        message_id: messageToReport.id,
        reported_content:
          messageToReport.message.slice(
            0,
            2000
          ),
      })

    if (submitError) {
      setReportError(
        `Could not submit report: ${submitError.message}`
      )
      setReportLoading(false)
      return
    }

    setReportLoading(false)
    setReportSubmitted(true)
  }

  function formatMessageTime(
    timestamp: string
  ) {
    const date =
      new Date(timestamp)

    const now =
      new Date()

    const isToday =
      date.toDateString() ===
      now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString(
        [],
        {
          hour: 'numeric',
          minute: '2-digit',
        }
      )
    }

    const yesterday =
      new Date(now)

    yesterday.setDate(
      now.getDate() - 1
    )

    const isYesterday =
      date.toDateString() ===
      yesterday.toDateString()

    if (isYesterday) {
      return `Yesterday · ${date.toLocaleTimeString(
        [],
        {
          hour: 'numeric',
          minute: '2-digit',
        }
      )}`
    }

    const sevenDaysAgo =
      new Date(now)

    sevenDaysAgo.setDate(
      now.getDate() - 7
    )

    if (date >= sevenDaysAgo) {
      return `${date.toLocaleDateString(
        [],
        {
          weekday: 'long',
        }
      )} · ${date.toLocaleTimeString(
        [],
        {
          hour: 'numeric',
          minute: '2-digit',
        }
      )}`
    }

    return `${date.toLocaleDateString(
      [],
      {
        month: 'short',
        day: 'numeric',
      }
    )} · ${date.toLocaleTimeString(
      [],
      {
        hour: 'numeric',
        minute: '2-digit',
      }
    )}`
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">

        <div className="text-center">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
            💬
          </div>

          <p className="mt-4 text-sm font-medium text-gray-500">
            Loading conversation...
          </p>

        </div>

      </main>
    )
  }

  const firstName =
    otherUser?.first_name ||
    'Unknown'

  const lastName =
    otherUser?.last_name ||
    ''

  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`
      .toUpperCase()

  return (
    <main className="min-h-screen bg-[#f7f7f5]">

      <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/95 backdrop-blur">

        <div className="mx-auto flex max-w-3xl items-center gap-4 px-5 py-4 sm:px-6">

          <button
            type="button"
            onClick={() =>
              router.push('/chats')
            }
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:bg-gray-100"
          >
            ←
          </button>

          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-700">
            {initials}
          </div>

          <div className="min-w-0">

            <h1 className="truncate font-bold">
              {firstName} {lastName}
            </h1>

            <p className="text-xs text-gray-400">
              Brework connection
            </p>

          </div>

        </div>

      </header>

      <div className="mx-auto flex min-h-[calc(100vh-73px)] max-w-3xl flex-col px-5 pb-32 pt-6 sm:px-6">

        {error && (
          <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {messages.length === 0 ? (

          <div className="flex flex-1 items-center justify-center">

            <div className="text-center">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl shadow-sm">
                💬
              </div>

              <h2 className="mt-4 text-lg font-semibold">
                Start the conversation
              </h2>

              <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
                Send {firstName} a message and
                start getting to know your
                Brework connection.
              </p>

            </div>

          </div>

        ) : (

          <div className="flex flex-1 flex-col justify-end gap-3">

            {messages.map((message) => {

              const isMine =
                message.sender_id ===
                currentUserId

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    isMine
                      ? 'justify-end'
                      : 'justify-start'
                  }`}
                >

                  <div
                    className={`max-w-[80%] sm:max-w-[65%] ${
                      isMine
                        ? 'items-end'
                        : 'items-start'
                    }`}
                  >

                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        isMine
                          ? 'rounded-br-md bg-black text-white'
                          : 'rounded-bl-md bg-white text-gray-900 shadow-sm'
                      }`}
                    >
                      {message.message}
                    </div>

                    <div
                      className={`mt-1 flex items-center gap-1 px-1 text-[10px] text-gray-400 ${
                        isMine
                          ? 'justify-end'
                          : 'justify-start'
                      }`}
                    >

                      <span>
                        {formatMessageTime(
                          message.created_at
                        )}
                      </span>

                      {isMine && (
                        <span
                          className={
                            message.read_at
                              ? 'font-bold text-black'
                              : 'text-gray-400'
                          }
                          title={
                            message.read_at
                              ? `Read ${formatMessageTime(
                                  message.read_at
                                )}`
                              : 'Sent'
                          }
                        >
                          {message.read_at
                            ? '✓✓'
                            : '✓'}
                        </span>
                      )}

                      {!isMine && (
                        <>
                          <span aria-hidden="true">
                            ·
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              openReportMessage(
                                message
                              )
                            }
                            className="font-semibold text-gray-400 transition hover:text-red-600"
                            aria-label="Report this message"
                          >
                            Report
                          </button>
                        </>
                      )}

                    </div>

                  </div>

                </div>
              )
            })}

            <div
              ref={messagesEndRef}
              className="h-px"
              aria-hidden="true"
            />

          </div>

        )}

      </div>

      {/* ======================================== */}
      {/* REPORT MESSAGE MODAL */}
      {/* ======================================== */}

      {messageToReport && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5 backdrop-blur-sm">

          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl sm:p-7">

            {reportSubmitted ? (

              <>

                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-xl">
                  ✓
                </div>

                <h2 className="mt-5 text-2xl font-bold">
                  Report submitted
                </h2>

                <p className="mt-3 text-sm leading-relaxed text-gray-500">
                  Thank you. We&apos;ll review this message and take appropriate action.
                </p>

                <button
                  type="button"
                  onClick={closeReportMessage}
                  className="mt-7 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white transition hover:opacity-90"
                >
                  Done
                </button>

              </>

            ) : (

              <>

                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-xl">
                  ⚠️
                </div>

                <h2 className="mt-5 text-2xl font-bold">
                  Report message?
                </h2>

                <p className="mt-3 text-sm leading-relaxed text-gray-500">
                  Reports are confidential. The message and your explanation will be sent for review.
                </p>

                <div className="mt-5 rounded-2xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-600">
                  &ldquo;{messageToReport.message}&rdquo;
                </div>

                <label className="mt-6 block text-sm font-semibold text-gray-700">
                  Reason
                </label>

                <select
                  value={reportReason}
                  onChange={(event) =>
                    setReportReason(
                      event.target.value
                    )
                  }
                  disabled={reportLoading}
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-black disabled:opacity-50"
                >
                  <option value="">
                    Select a reason
                  </option>
                  <option value="harassment">
                    Harassment or bullying
                  </option>
                  <option value="hate_speech">
                    Hate speech
                  </option>
                  <option value="spam">
                    Spam or scam
                  </option>
                  <option value="inappropriate_content">
                    Inappropriate content
                  </option>
                  <option value="impersonation">
                    Impersonation
                  </option>
                  <option value="safety_concern">
                    Safety concern
                  </option>
                  <option value="other">
                    Other
                  </option>
                </select>

                <label className="mt-5 block text-sm font-semibold text-gray-700">
                  Additional details{' '}
                  <span className="font-normal text-gray-400">
                    (optional)
                  </span>
                </label>

                <textarea
                  value={reportDetails}
                  onChange={(event) =>
                    setReportDetails(
                      event.target.value.slice(
                        0,
                        1000
                      )
                    )
                  }
                  disabled={reportLoading}
                  rows={4}
                  placeholder="Tell us what happened."
                  className="mt-2 w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-black disabled:opacity-50"
                />

                <p className="mt-1 text-right text-xs text-gray-400">
                  {reportDetails.length}/1000
                </p>

                {reportError && (
                  <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                    {reportError}
                  </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-3">

                  <button
                    type="button"
                    onClick={closeReportMessage}
                    disabled={reportLoading}
                    className="rounded-xl border border-gray-200 px-4 py-3 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleReportMessage}
                    disabled={
                      reportLoading ||
                      !reportReason
                    }
                    className="rounded-xl bg-amber-600 px-4 py-3 font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {reportLoading
                      ? 'Submitting...'
                      : 'Submit report'}
                  </button>

                </div>

              </>

            )}

          </div>

        </div>

      )}

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur">

        <form
          onSubmit={sendMessage}
          className="mx-auto flex max-w-3xl items-end gap-3 px-5 py-4 sm:px-6"
        >

          <input
            type="text"
            value={newMessage}
            onChange={(event) =>
              setNewMessage(
                event.target.value
              )
            }
            placeholder={`Message ${firstName}...`}
            disabled={sending}
            className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white"
          />

          <button
            type="submit"
            disabled={
              sending ||
              !newMessage.trim()
            }
            className="rounded-2xl bg-black px-5 py-3 text-sm font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending
              ? 'Sending...'
              : 'Send'}
          </button>

        </form>

      </div>

    </main>
  )
}
