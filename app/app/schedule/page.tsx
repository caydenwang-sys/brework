'use client'

import {
  Suspense,
  useEffect,
  useState,
  useRef,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  useRouter,
  useSearchParams,
} from 'next/navigation'

type Match = {
  id: number
  user_1_id: string
  user_2_id: string
  status: string | null
}

type Profile = {
  id: string
  first_name: string | null
  last_name: string | null
  major: string | null
  career_goal: string | null
}

type Meeting = {
  id: number
  match_id: number | null
  scheduled_date: string | null
  start_time: string | null
  end_time: string | null
  location: string | null
  status: string | null
}

type PreferredTime = {
  id: number
  day_of_week: number
  start_time: string
  end_time: string
}

const preferredDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function nextPreferredDate(slot: PreferredTime) {
  const today = pacificToday()
  const date = new Date(`${today}T12:00:00Z`)
  const difference = ((slot.day_of_week % 7) - date.getUTCDay() + 7) % 7
  date.setUTCDate(date.getUTCDate() + difference)
  let day = date.toISOString().slice(0, 10)
  if (pacificTimestamp(day, slot.start_time) <= Date.now() || !Number.isFinite(pacificTimestamp(day, slot.start_time))) {
    date.setUTCDate(date.getUTCDate() + 7)
    day = date.toISOString().slice(0, 10)
  }
  return day
}

type ProposedTime = { date: string; start_time: string; end_time: string }

function pacificToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = (name: string) => parts.find(part => part.type === name)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

// Meetings use campus wall-clock times. Resolve Pacific DST rather than the device timezone.
function pacificTimestamp(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wallTime = Date.UTC(year, month - 1, day, hour, minute)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  let instant = wallTime
  for (let step = 0; step < 4; step++) {
    const parts = formatter.formatToParts(new Date(instant))
    const value = (name: string) => Number(parts.find(part => part.type === name)?.value)
    const displayed = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'))
    if (displayed === wallTime) return instant
    instant += wallTime - displayed
  }
  return NaN
}

// ============================================
// TIME HELPERS
// ============================================

function formatTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number)

  const date = new Date()
  date.setHours(hours, minutes, 0, 0)

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)

  return hours * 60 + minutes
}

function minutesToTime(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

// ============================================
// DATE HELPERS
// ============================================

function formatDate(dateString: string) {
  const date = new Date(
    `${dateString}T00:00:00`
  )

  return date.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

// ============================================
// COMPONENT
// ============================================

function SchedulePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const requestedMatch =
    searchParams.get('match')

  const requestedMatchId =
    requestedMatch
      ? Number(requestedMatch)
      : null

  const [userId, setUserId] =
    useState<string | null>(null)

  const [matches, setMatches] =
    useState<Match[]>([])

  const [profiles, setProfiles] =
    useState<Record<string, Profile>>({})

  const [meetings, setMeetings] =
    useState<Meeting[]>([])

  const [selectedMatch, setSelectedMatch] =
    useState<Match | null>(null)

  const [loading, setLoading] =
    useState(true)

  const [scheduling, setScheduling] =
    useState(false)

  const [cancelling, setCancelling] =
    useState<number | null>(null)

  const [error, setError] =
    useState('')

  const [success, setSuccess] =
    useState('')

  const [location, setLocation] =
    useState('')

  const [matchSearch, setMatchSearch] =
    useState('')

  const [proposedDate, setProposedDate] = useState(pacificToday)
  const [proposedStart, setProposedStart] = useState('')
  const [duration, setDuration] = useState(30)
  const schedulingLock = useRef(false)
  const [preferredTimes, setPreferredTimes] = useState<PreferredTime[]>([])
  const [preferredOwner, setPreferredOwner] = useState<number | null>(null)
  const [preferredLoading, setPreferredLoading] = useState(false)
  const [preferredError, setPreferredError] = useState('')
  const [preferredReload, setPreferredReload] = useState(0)

  useEffect(() => {
    if (!selectedMatch || !userId) return
    let active = true
    const matchId = selectedMatch.id
    const otherUserId = selectedMatch.user_1_id === userId
      ? selectedMatch.user_2_id : selectedMatch.user_1_id
    setPreferredOwner(matchId)
    setPreferredTimes([])
    setPreferredLoading(true)
    setPreferredError('')

    async function loadPreferredTimes() {
      try {
        const supabase = createClient()
        const { data, error: loadError } = await supabase
          .from('availability')
          .select('id,day_of_week,start_time,end_time')
          .eq('user_id', otherUserId)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true })
        if (loadError) throw loadError
        if (active) setPreferredTimes((data || []) as PreferredTime[])
      } catch (cause) {
        console.error('Could not load preferred times:', cause)
        if (active) setPreferredError('Preferred times could not be loaded. You can still suggest any time below.')
      } finally {
        if (active) setPreferredLoading(false)
      }
    }
    void loadPreferredTimes()
    return () => { active = false }
  }, [selectedMatch, userId, preferredReload])

  function usePreferredTime(slot: PreferredTime) {
    if (schedulingLock.current) return
    setProposedDate(nextPreferredDate(slot))
    setProposedStart(slot.start_time.slice(0, 5))
    const windowLength = timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time)
    const suggestedDuration = [30, 15, 45, 60].find(minutes => minutes <= windowLength)
    setDuration(suggestedDuration || 15)
    setError('')
    setSuccess('')
  }

  // ============================================
  // LOAD SCHEDULE DATA
  // ============================================

  useEffect(() => {
    async function loadSchedule() {
      const supabase = createClient()

      setLoading(true)
      setError('')

      // ------------------------------------------
      // GET CURRENT USER
      // ------------------------------------------

      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser()

      if (userError || !user) {
        router.push('/login')
        return
      }

      setUserId(user.id)

      // ------------------------------------------
      // GET MATCHES
      // ------------------------------------------

      const {
        data: matchData,
        error: matchError,
      } =
        await supabase
          .from('matches')
          .select(`
            id,
            user_1_id,
            user_2_id,
            status
          `)
          .or(
            `user_1_id.eq.${user.id},user_2_id.eq.${user.id}`
          )
          .eq('status', 'active')

      if (matchError) {
        console.error(matchError)

        setError(
          `Could not load your matches: ${matchError.message}`
        )

        setLoading(false)
        return
      }

      const loadedMatches =
        (matchData || []) as Match[]

      setMatches(loadedMatches)

      // ------------------------------------------
      // GET OTHER USER IDS
      // ------------------------------------------

      const otherUserIds =
        loadedMatches.map((match) =>
          match.user_1_id === user.id
            ? match.user_2_id
            : match.user_1_id
        )

      // ------------------------------------------
      // GET PROFILES
      // ------------------------------------------

      if (otherUserIds.length > 0) {
        const {
          data: profileData,
          error: profileError,
        } =
          await supabase
            .from('profiles')
            .select(`
              id,
              first_name,
              last_name,
              major,
              career_goal
            `)
            .in('id', otherUserIds)

        if (profileError) {
          console.error(profileError)

          setError(
            `Could not load your match profiles: ${profileError.message}`
          )

          setLoading(false)
          return
        }

        const profileMap:
          Record<string, Profile> = {}

        ;(profileData || []).forEach(
          (profile) => {
            profileMap[profile.id] =
              profile as Profile
          }
        )

        setProfiles(profileMap)
      }

      // ------------------------------------------
      // GET EXISTING MEETINGS
      // ------------------------------------------

      const matchIds =
        loadedMatches.map(
          (match) => match.id
        )

      if (matchIds.length > 0) {
        const {
          data: meetingData,
          error: meetingError,
        } =
          await supabase
            .from('meetings')
            .select(`
              id,
              match_id,
              scheduled_date,
              start_time,
              end_time,
              location,
              status
            `)
            .in('match_id', matchIds)
            .order(
              'scheduled_date',
              {
                ascending: true,
              }
            )

        if (meetingError) {
          console.error(
            meetingError
          )

          setError(
            `Could not load your scheduled meetings: ${meetingError.message}`
          )

          setLoading(false)
          return
        }

        setMeetings(
          (meetingData || []) as Meeting[]
        )
      }

      setLoading(false)
    }

    loadSchedule()
  }, [router])

  // ============================================
  // GET OTHER USER
  // ============================================

  function getOtherUserId(match: Match) {
    if (!userId) {
      return null
    }

    return match.user_1_id === userId
      ? match.user_2_id
      : match.user_1_id
  }

  function getOtherProfile(match: Match) {
    const otherUserId =
      getOtherUserId(match)

    if (!otherUserId) {
      return null
    }

    return profiles[otherUserId] || null
  }

  function getProfileName(match: Match) {
    const profile =
      getOtherProfile(match)

    if (!profile) {
      return 'Your match'
    }

    return (
      `${profile.first_name || ''} ` +
      `${profile.last_name || ''}`
    ).trim() || 'Your match'
  }

  // ============================================
  // FILTER MATCHES
  // ============================================

  const filteredMatches =
    matches.filter((match) => {
      const search =
        matchSearch
          .trim()
          .toLowerCase()

      if (!search) {
        return true
      }

      const profile =
        getOtherProfile(match)

      if (!profile) {
        return false
      }

      const fullName =
        `${profile.first_name || ''} ${
          profile.last_name || ''
        }`
          .trim()
          .toLowerCase()

      const major =
        profile.major
          ?.toLowerCase() || ''

      const careerGoal =
        profile.career_goal
          ?.toLowerCase() || ''

      return (
        fullName.includes(search) ||
        major.includes(search) ||
        careerGoal.includes(search)
      )
    }).sort((a, b) => Number(b.id === selectedMatch?.id) - Number(a.id === selectedMatch?.id))

  // ============================================
  // RELOAD MEETINGS
  // ============================================

  async function reloadMeetings() {
    if (matches.length === 0) {
      setMeetings([])
      return
    }

    const supabase = createClient()

    const matchIds =
      matches.map(
        (match) => match.id
      )

    const {
      data: updatedMeetings,
      error: updatedMeetingsError,
    } =
      await supabase
        .from('meetings')
        .select(`
          id,
          match_id,
          scheduled_date,
          start_time,
          end_time,
          location,
          status
        `)
        .in(
          'match_id',
          matchIds
        )
        .order(
          'scheduled_date',
          {
            ascending: true,
          }
        )

    if (updatedMeetingsError) {
      console.error(
        'Could not reload meetings:',
        updatedMeetingsError
      )

      return
    }

    setMeetings(
      (updatedMeetings || []) as Meeting[]
    )
  }

  function selectMatch(match: Match) {
    if (schedulingLock.current) return
    setPreferredOwner(null)
    setSelectedMatch(match)
    setLocation('')
    setProposedDate(pacificToday())
    setProposedStart('')
    setDuration(30)
    setMatchSearch('')
    setError('')
    setSuccess('')
  }

  // ============================================
  // AUTO-SELECT MATCH FROM URL
  // ============================================

  useEffect(() => {
    if (
      loading ||
      !userId ||
      !requestedMatchId ||
      Number.isNaN(requestedMatchId) ||
      selectedMatch
    ) {
      return
    }

    const requestedMatch =
      matches.find(
        (match) =>
          match.id === requestedMatchId
      )

    if (!requestedMatch) {
      return
    }

    selectMatch(requestedMatch)
  }, [
    loading,
    userId,
    requestedMatchId,
    matches,
    selectedMatch,
  ])

  // ============================================
  // SCHEDULE MEETING
  // ============================================

  async function scheduleMeeting(
    overlap: ProposedTime
  ) {
    if (
      !selectedMatch ||
      !userId ||
      schedulingLock.current
    ) {
      return
    }

    setError('')
    setSuccess('')
    schedulingLock.current = true
    setScheduling(true)

    const supabase = createClient()

    const otherUserId =
      getOtherUserId(selectedMatch)

    if (!otherUserId) {
      setError(
        'Could not determine who to send this coffee chat request to.'
      )

      schedulingLock.current = false
      setScheduling(false)
      return
    }

    const {
      data: existingMeetings,
      error: existingMeetingError,
    } =
      await supabase
        .from('meetings')
        .select(`
          id,
          match_id,
          scheduled_date,
          start_time,
          end_time,
          location,
          status
        `)
        .eq(
          'match_id',
          selectedMatch.id
        )
        .eq(
          'scheduled_date',
          overlap.date
        )
        .in(
          'status',
          [
            'pending',
            'scheduled',
          ]
        )


    if (existingMeetingError) {
      console.error(
        existingMeetingError
      )

      setError(
        `Could not check for an existing meeting: ${existingMeetingError.message}`
      )

      schedulingLock.current = false
      setScheduling(false)
      return
    }

    // Preferred windows are suggestions; reserve only actual meeting times.
    const minutes = (time: string) => {
      const [hours, mins] = time.split(':').map(Number)
      return hours * 60 + mins
    }
    const proposedStart = minutes(overlap.start_time)
    const proposedEnd = minutes(overlap.end_time)
    const conflictingMeeting = existingMeetings?.find(meeting => {
      if (!meeting.start_time) return false
      const start = minutes(meeting.start_time)
      const end = meeting.end_time ? minutes(meeting.end_time) : start + 30
      return proposedStart < end && proposedEnd > start
    })

    if (conflictingMeeting) {
      setError(
        'This time overlaps another coffee chat or pending request with this person. Choose a different time.'
      )

      schedulingLock.current = false
      setScheduling(false)

      await reloadMeetings()


      return
    }

    const {
      data: newMeeting,
      error: meetingError,
    } =
      await supabase
        .from('meetings')
        .insert({
          match_id:
            selectedMatch.id,

          scheduled_date:
            overlap.date,

          start_time:
            `${overlap.start_time}:00`,

          end_time:
            `${overlap.end_time}:00`,

          location:
            location.trim() || null,

          status:
            'pending',

          proposed_by:
            userId,

          responded_by:
            null,

          responded_at:
            null,
        })
        .select(`
          id,
          match_id,
          scheduled_date,
          start_time,
          end_time,
          location,
          status
        `)
        .single()

    if (meetingError) {
      console.error(
        'MEETING INSERT ERROR:',
        meetingError
      )

      setError(
        `Could not send this coffee chat request: ${meetingError.message}`
      )

      schedulingLock.current = false
      setScheduling(false)
      return
    }

    if (newMeeting) {
      setMeetings(
        (current) => [
          ...current,
          newMeeting as Meeting,
        ]
      )
    }

    setSuccess(
      `Coffee chat request sent to ${getProfileName(
        selectedMatch
      )}! They'll need to accept it before the chat is confirmed.`
    )

    schedulingLock.current = false
    setScheduling(false)
  }

  async function submitProposal() {
    if (!selectedMatch || schedulingLock.current) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(proposedDate) || !/^\d{2}:\d{2}$/.test(proposedStart)) {
      setError('Choose a date and start time.')
      return
    }
    const instant = pacificTimestamp(proposedDate, proposedStart)
    if (!Number.isFinite(instant) || instant <= Date.now()) {
      setError('Choose a valid future time in Pacific time. This time may already have passed or fall during a daylight saving clock change.')
      return
    }
    const endMinutes = timeToMinutes(proposedStart) + duration
    if (endMinutes >= 24 * 60) {
      setError('Choose a time that finishes before midnight, or use a shorter duration.')
      return
    }
    try {
      await scheduleMeeting({ date: proposedDate, start_time: proposedStart, end_time: minutesToTime(endMinutes) })
    } catch (cause) {
      console.error('Could not send coffee chat request:', cause)
      setError('Could not send the request. Check your connection and try again.')
      schedulingLock.current = false
      setScheduling(false)
    }
  }

  // ============================================
  // CANCEL MEETING
  // ============================================

  async function cancelMeeting(
    meetingId: number
  ) {
    if (cancelling !== null) {
      return
    }

    const confirmed =
      window.confirm(
        'Are you sure you want to cancel this coffee chat?'
      )

    if (!confirmed) {
      return
    }

    setError('')
    setSuccess('')
    setCancelling(meetingId)

    const supabase = createClient()

    const meeting =
      meetings.find(
        (meeting) =>
          meeting.id === meetingId
      )

    const meetingMatch =
      matches.find(
        (match) =>
          match.id === meeting?.match_id
      )

    const otherUserId =
      meetingMatch
        ? getOtherUserId(meetingMatch)
        : null

    const {
      error: cancelError,
    } =
      await supabase
        .from('meetings')
        .update({
          status: 'cancelled',
        })
        .eq(
          'id',
          meetingId
        )

    if (cancelError) {
      console.error(
        'Could not cancel meeting:',
        cancelError
      )

      setError(
        `Could not cancel this meeting: ${cancelError.message}`
      )

      setCancelling(null)
      return
    }

    if (
      otherUserId &&
      meeting
    ) {
      const {
        data: myProfile,
      } =
        await supabase
          .from('profiles')
          .select(`
            first_name,
            last_name
          `)
          .eq(
            'id',
            userId
          )
          .single()

      const cancellerName =
        (
          `${myProfile?.first_name || ''} ` +
          `${myProfile?.last_name || ''}`
        ).trim() || 'Your match'

      let notificationContent =
        `${cancellerName} cancelled your coffee chat`

      if (
        meeting.scheduled_date &&
        meeting.start_time
      ) {
        notificationContent +=
          ` scheduled for ${formatDate(
            meeting.scheduled_date
          )} at ${formatTime(
            meeting.start_time
          )}.`
      } else {
        notificationContent += '.'
      }

      const {
        error: notificationError,
      } =
        await supabase
          .from('notifications')
          .insert({
            user_id:
              otherUserId,

            type:
              'coffee_chat_cancelled',

            title:
              'Coffee chat cancelled',

            message:
              notificationContent,

            related_user_id:
              userId,

            related_match_id:
              meeting.match_id,

            is_read:
              false,
          })

      if (notificationError) {
        console.error(
          'Could not send cancellation notification:',
          notificationError
        )
      }
    }

    setMeetings(
      (current) =>
        current.filter(
          (meeting) =>
            meeting.id !==
            meetingId
        )
    )

    setSuccess(
      'Your coffee chat has been cancelled.'
    )

    setCancelling(null)

    await reloadMeetings()


  }

  // ============================================
  // UPCOMING MEETINGS
  // ============================================

  const upcomingMeetings =
    meetings.filter(
      (meeting) =>
        meeting.status === 'scheduled'
    )

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
        <div className="text-center">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
            ☕
          </div>

          <p className="mt-4 text-sm font-medium text-gray-500">
            Loading your schedule...
          </p>

        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] pb-28">

      {/* HEADER */}

      <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/90 backdrop-blur">

        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-6">

          <button
            type="button"
            onClick={() =>
              router.push('/dashboard')
            }
            className="text-xl font-bold tracking-tight transition hover:opacity-70"
          >
            Brework
          </button>

          <button
            type="button"
            onClick={() =>
              router.push('/dashboard')
            }
            className="rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-black"
          >
            Home
          </button>

        </div>

      </header>

      {/* MAIN */}

      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 sm:py-12">

        {/* TITLE */}

        <section className="mb-10">

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
            Brework
          </p>

          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            Schedule a coffee chat.
          </h1>

          <p className="mt-3 max-w-xl text-base leading-relaxed text-gray-500">
            Suggest a time, or discuss the details in chat first. Your connection confirms before it goes on your calendars.
          </p>

        </section>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-700">

            <p>
              {success}
            </p>

            <button
              type="button"
              onClick={() =>
                router.push('/coffee-chats')
              }
              className="mt-3 font-semibold underline transition hover:text-green-900"
            >
              View Coffee Chats →
            </button>

          </div>
        )}

        {selectedMatch && (
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Coffee chat with</p>
            <p className="mt-1 text-xl font-bold">{getProfileName(selectedMatch)}</p>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">

          {/* MATCHES */}

          <section className="rounded-3xl border border-gray-200/70 bg-white p-6 shadow-sm">

            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              Your connections
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Who do you want to meet?
            </h2>

            {matches.length === 0 ? (

              <div className="mt-6 rounded-2xl bg-gray-50 p-6 text-center">

                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl shadow-sm">
                  👥
                </div>

                <h3 className="mt-4 font-semibold">
                  No connections yet
                </h3>

                <p className="mt-1 text-sm leading-relaxed text-gray-500">
                  Head to Discover to find people to connect with.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    router.push('/discover')
                  }
                  className="mt-5 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
                >
                  Find matches →
                </button>

              </div>

            ) : (

              <div className="mt-6">

                {/* SEARCH MATCHES */}

                <div className="relative">

                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    🔎
                  </span>

                  <input
                    type="search"
                    aria-label="Search connections"
                    value={matchSearch}
                    onChange={(event) =>
                      setMatchSearch(
                        event.target.value
                      )
                    }
                    placeholder="Search connections..."
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-10 text-sm outline-none transition focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-100"
                  />

                  {matchSearch && (
                    <button
                      type="button"
                      onClick={() =>
                        setMatchSearch('')
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400 transition hover:text-black"
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}

                </div>

                {filteredMatches.length === 0 ? (

                  <div className="mt-4 rounded-2xl bg-gray-50 p-6 text-center">

                    <p className="font-semibold">
                      No matches found
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Try searching by name, major, or career interest.
                    </p>

                  </div>

                ) : (

                  <div className="mt-4 space-y-3">

                    {filteredMatches.map(
                      (match) => {

                        const profile =
                          getOtherProfile(
                            match
                          )

                        const isSelected =
                          selectedMatch?.id ===
                          match.id

                        return (
                          <button
                            key={match.id}
                            type="button"
                            disabled={scheduling}
                            aria-pressed={isSelected}
                            onClick={() =>
                              selectMatch(
                                match
                              )
                            }
                            className={`w-full rounded-2xl border p-4 text-left transition ${
                              isSelected
                                ? 'border-black bg-white shadow-sm'
                                : 'border-gray-200/70 bg-gray-50 hover:bg-white'
                            }`}
                          >

                            <p className="font-semibold">
                              {getProfileName(
                                match
                              )}
                            </p>

                            {profile?.major && (
                              <p className="mt-1 text-sm text-gray-500">
                                {profile.major}
                              </p>
                            )}

                            {profile?.career_goal && (
                              <p className="mt-1 text-sm text-gray-400">
                                {profile.career_goal}
                              </p>
                            )}

                          </button>
                        )
                      }
                    )}

                  </div>

                )}

              </div>

            )}

          </section>

          {/* SCHEDULING AREA */}
          <section className={`${selectedMatch ? 'order-first lg:order-last' : ''} rounded-3xl border border-gray-200/70 bg-white p-6 shadow-sm`}>
            {!selectedMatch ? (
              <div className="py-12 text-center">
                <h2 className="text-2xl font-bold">Who would you like to meet?</h2>
                <p className="mt-3 text-sm text-gray-500">Choose a connection to suggest a time. You do not need matching availability.</p>
              </div>
            ) : (
              <form onSubmit={event => { event.preventDefault(); void submitProposal() }}>
                <h2 className="text-2xl font-bold">Suggest a time</h2>
                <p className="mt-2 text-sm text-gray-500">{getProfileName(selectedMatch)} will review your request. Availability blocks are optional.</p>
                <p className="mt-3 text-sm font-semibold">All times are Pacific time (UCSD).</p>
                <section aria-labelledby="preferred-times-heading" className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <h3 id="preferred-times-heading" className="font-semibold">{getProfileName(selectedMatch)}&apos;s preferred times</h3>
                  <p className="mt-1 text-xs text-gray-500">Weekly preferences in Pacific time. These are suggestions, not confirmed bookings. You can request any other time.</p>
                  {preferredOwner !== selectedMatch.id || preferredLoading ? (
                    <p role="status" className="mt-3 text-sm text-gray-500">Loading preferred times…</p>
                  ) : preferredError ? (
                    <div className="mt-3">
                      <p className="text-sm text-gray-500">{preferredError}</p>
                      <button type="button" onClick={() => setPreferredReload(value => value + 1)} className="mt-2 text-sm font-semibold underline">Try again</button>
                    </div>
                  ) : preferredTimes.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-500">No preferred times are available to show. Suggest a time below or discuss it in chat.</p>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {preferredTimes.map(slot => (
                        <button key={slot.id} type="button" disabled={scheduling} onClick={() => usePreferredTime(slot)}
                          className="rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-gray-400 disabled:opacity-50">
                          <span className="block text-sm font-semibold">{preferredDays[slot.day_of_week % 7]}</span>
                          <span className="mt-1 block text-sm text-gray-500">{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</span>
                          <span className="mt-2 block text-xs font-semibold">Use next {preferredDays[slot.day_of_week % 7]} →</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                <p className="mt-5 text-sm font-semibold">Choose a preferred time above, or suggest your own below.</p>
                <fieldset disabled={scheduling} className="mt-6 space-y-5 disabled:opacity-70">
                  <div>
                    <label htmlFor="coffee-date" className="block text-sm font-semibold">Date</label>
                    <input id="coffee-date" type="date" required min={pacificToday()} value={proposedDate}
                      onChange={event => setProposedDate(event.target.value)}
                      className="mt-2 block w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-3 text-base" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label htmlFor="coffee-time" className="block text-sm font-semibold">Start time</label>
                      <input id="coffee-time" type="time" required value={proposedStart}
                        onChange={event => setProposedStart(event.target.value)}
                        className="mt-2 block w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-3 text-base" />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="coffee-duration" className="block text-sm font-semibold">Duration</label>
                      <select id="coffee-duration" value={duration} onChange={event => setDuration(Number(event.target.value))}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-base">
                        {[15, 30, 45, 60].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="coffee-location" className="block text-sm font-semibold">Place or video link (optional)</label>
                    <input id="coffee-location" type="text" value={location} maxLength={150}
                      onChange={event => setLocation(event.target.value)} placeholder="A campus café, Zoom, or decide in chat"
                      className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-base" />
                  </div>
                  <button type="submit" className="w-full rounded-xl bg-black px-4 py-3 font-semibold text-white">
                    {scheduling ? 'Sending…' : 'Send coffee chat request'}
                  </button>
                </fieldset>
                <button type="button" disabled={scheduling}
                  onClick={() => router.push(`/chats/conversation?matchId=${selectedMatch.id}`)}
                  className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold">
                  Discuss time and place in chat
                </button>
                <p className="mt-3 text-xs text-gray-500">Once you agree in chat, send the time here so it can be confirmed and added to both Brework calendars.</p>
              </form>
            )}
          </section>

        </div>

        {/* UPCOMING MEETINGS */}

        <section className="mt-8 rounded-3xl border border-gray-200/70 bg-white p-6 shadow-sm">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Upcoming
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Your scheduled chats
              </h2>

            </div>

            <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
              {upcomingMeetings.length}
            </div>

          </div>

          {upcomingMeetings.length === 0 ? (

            <div className="mt-6 rounded-2xl bg-gray-50 p-6 text-center">

              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl shadow-sm">
                📅
              </div>

              <h3 className="mt-4 font-semibold">
                No meetings scheduled
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                Choose a match above to schedule your first coffee chat.
              </p>

            </div>

          ) : (

            <div className="mt-6 space-y-3">

              {upcomingMeetings.map(
                (meeting) => {

                  const meetingMatch =
                    matches.find(
                      (match) =>
                        match.id ===
                        meeting.match_id
                    )

                  return (
                    <div
                      key={meeting.id}
                      className="rounded-2xl border border-gray-200/70 bg-gray-50 p-4"
                    >

                      <div className="flex items-start justify-between gap-4">

                        <div>

                          <p className="font-semibold">
                            {meetingMatch
                              ? getProfileName(
                                  meetingMatch
                                )
                              : 'Brework match'}
                          </p>

                          <p className="mt-2 font-medium">
                            {meeting.scheduled_date
                              ? formatDate(
                                  meeting.scheduled_date
                                )
                              : 'Date not set'}
                          </p>

                          {meeting.start_time && (
                            <p className="mt-1 text-sm text-gray-500">
                              {formatTime(
                                meeting.start_time
                              )}

                              {meeting.end_time &&
                                ` – ${formatTime(
                                  meeting.end_time
                                )}`}
                            </p>
                          )}

                          {meeting.location && (
                            <p className="mt-1 text-sm text-gray-500">
                              📍{' '}
                              {meeting.location}
                            </p>
                          )}

                          {meeting.status && (
                            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-green-600">
                              {meeting.status}
                            </p>
                          )}

                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            cancelMeeting(
                              meeting.id
                            )
                          }
                          disabled={
                            cancelling ===
                            meeting.id
                          }
                          className="shrink-0 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          {cancelling ===
                          meeting.id
                            ? 'Cancelling...'
                            : 'Cancel'}
                        </button>

                      </div>

                    </div>
                  )
                }
              )}

            </div>

          )}

        </section>

      </div>

      {/* BOTTOM NAV */}

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white">

        <div className="mx-auto flex max-w-3xl justify-around px-3 py-4">

          <button
            type="button"
            onClick={() =>
              router.push('/dashboard')
            }
            className="flex flex-col items-center gap-1 px-3 text-xs text-gray-500 transition hover:text-black"
          >
            <span className="text-base">
              🏠
            </span>
            Home
          </button>

          <button
            type="button"
            onClick={() =>
              router.push('/discover')
            }
            className="flex flex-col items-center gap-1 px-3 text-xs text-gray-500 transition hover:text-black"
          >
            <span className="text-base">
              ✨
            </span>
            Discover
          </button>

          <button
            type="button"
            onClick={() =>
              router.push('/connections')
            }
            className="flex flex-col items-center gap-1 px-3 text-xs text-gray-500 transition hover:text-black"
          >
            <span className="text-base">
              👥
            </span>
            Connections
          </button>

          <button
            type="button"
            onClick={() =>
              router.push('/chats')
            }
            className="flex flex-col items-center gap-1 px-3 text-xs text-gray-500 transition hover:text-black"
          >
            <span className="text-base">
              💬
            </span>
            Chats
          </button>

          <button
            type="button"
            onClick={() =>
              router.push('/profile')
            }
            className="flex flex-col items-center gap-1 px-3 text-xs text-gray-500 transition hover:text-black"
          >
            <span className="text-base">
              👤
            </span>
            Profile
          </button>

        </div>

      </nav>

    </main>
  )
}

export default function SchedulePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
          <div className="text-center">

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
              ☕
            </div>

            <p className="mt-4 text-sm font-medium text-gray-500">
              Loading your schedule...
            </p>

          </div>
        </main>
      }
    >
      <SchedulePageContent />
    </Suspense>
  )
}
