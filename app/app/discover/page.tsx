'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { openExternalUrl } from '@/lib/native/openExternalUrl'
import { useRouter } from 'next/navigation'
import BottomNav from '../components/BottomNav'

type Profile = {
  id: string
  first_name: string | null
  last_name: string | null
  major: string | null
  academic_year: string | null
  bio: string | null
  career_goal: string | null
  profile_photo_url: string | null
  is_discoverable: boolean
  show_academic_info: boolean
  show_career_goal: boolean
  resume_url: string | null
}

type ScoredProfile = {
  profile: Profile
  score: number
  reasons: string[]
}

type MatchPreferences = {
  same_major: boolean
  similar_career_interests: boolean
  outside_major: boolean
  upperclassmen: boolean
  mentors: boolean
  project_collaborators: boolean
  match_style: string
}

function normalize(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function academicRank(value: string | null | undefined) {
  const year = normalize(value)
  if (/graduate|masters|master|phd|doctoral/.test(year)) return 5
  if (/senior|fourth|4th/.test(year)) return 4
  if (/junior|third|3rd/.test(year)) return 3
  if (/sophomore|second|2nd/.test(year)) return 2
  if (/freshman|first|1st/.test(year)) return 1
  return 0
}

function projectKeywords(text: string) {
  const ignored = new Set(['about', 'after', 'also', 'been', 'being', 'build', 'building', 'have', 'into', 'more', 'other', 'project', 'projects', 'that', 'their', 'them', 'there', 'these', 'this', 'through', 'using', 'want', 'were', 'what', 'when', 'which', 'with', 'work', 'working', 'would', 'your'])
  return new Set((text.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter(word => !ignored.has(word)))
}

export default function DiscoverPage() {
  const router = useRouter()
  const [round, setRound] = useState(0)
  const [possibleScore, setPossibleScore] = useState(6)

  const [profiles, setProfiles] =
    useState<ScoredProfile[]>([])

  const [currentIndex, setCurrentIndex] =
    useState(0)

  const [loading, setLoading] =
    useState(true)

  const [sending, setSending] =
    useState(false)

  const [error, setError] =
    useState('')

  const [userId, setUserId] =
    useState('')

  // ============================================
  // LOAD PROFILES
  // ============================================

  useEffect(() => {
    let cancelled = false
    async function loadProfiles() {
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

      setUserId(user.id)

      const { data: preferences, error: preferencesError } = await supabase
        .from('match_preferences')
        .select('same_major,similar_career_interests,outside_major,upperclassmen,mentors,project_collaborators,match_style')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (preferencesError) {
        setError(`Could not load matching preferences: ${preferencesError.message}`)
        setLoading(false)
        return
      }
      const preference: MatchPreferences = {
        same_major: false,
        similar_career_interests: false,
        outside_major: false,
        upperclassmen: false,
        mentors: false,
        project_collaborators: false,
        match_style: 'similar',
        ...preferences,
      }

      // ========================================
      // GET YOUR PROFILE
      // ========================================

      const {
        data: myProfile,
        error: myProfileError,
      } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          major,
          academic_year,
          bio,
          career_goal,
          profile_photo_url
        `)
        .eq('id', user.id)
        .single()

      if (myProfileError || !myProfile) {
        setError(
          `Could not load your profile: ${
            myProfileError?.message ||
            'Profile not found'
          }`
        )

        setLoading(false)
        return
      }

      // ========================================
      // GET EXISTING CONNECTIONS
      // ========================================

      const {
        data: connections,
        error: connectionsError,
      } = await supabase
        .from('connections')
        .select(
          'sender_id, receiver_id, status'
        )
        .or(
          `sender_id.eq.${user.id},receiver_id.eq.${user.id}`
        )

      if (connectionsError) {
        setError(
          `Could not load connections: ${connectionsError.message}`
        )

        setLoading(false)
        return
      }

      // ========================================
      // GET BLOCKED RELATIONSHIPS
      // ========================================

      const {
        data: blockedRelationships,
        error: blockedRelationshipsError,
      } = await supabase
        .from('blocked_users')
        .select(`
          blocker_id,
          blocked_id
        `)
        .or(
          `blocker_id.eq.${user.id},blocked_id.eq.${user.id}`
        )

      if (blockedRelationshipsError) {
        setError(
          `Could not load blocked users: ${blockedRelationshipsError.message}`
        )

        setLoading(false)
        return
      }

      // ========================================
      // EXCLUDE CONNECTED / PENDING / BLOCKED USERS
      // ========================================

      const excludedUserIds = new Set<string>()

      for (const connection of connections || []) {
        const otherUserId =
          connection.sender_id === user.id
            ? connection.receiver_id
            : connection.sender_id

        if (
          connection.status === 'accepted' ||
          connection.status === 'pending'
        ) {
          excludedUserIds.add(otherUserId)
        }
      }

      for (
        const blockedRelationship of
        blockedRelationships || []
      ) {
        const otherUserId =
          blockedRelationship.blocker_id ===
          user.id
            ? blockedRelationship.blocked_id
            : blockedRelationship.blocker_id

        excludedUserIds.add(otherUserId)
      }

      // ========================================
      // GET OTHER STUDENTS
      // ========================================

      // Page through the full eligible pool instead of stopping at the API row limit.
      const allProfiles: Profile[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data: page, error: profilesError } = await supabase
          .from('profiles')
          .select('id,first_name,last_name,major,academic_year,bio,career_goal,profile_photo_url,is_discoverable,show_academic_info,show_career_goal,resume_url')
          .neq('id', user.id)
          .eq('is_discoverable', true)
          .order('id')
          .range(offset, offset + 999)
        if (cancelled) return
        if (profilesError) {
          setError(`Could not load students: ${profilesError.message}`)
          setLoading(false)
          return
        }
        allProfiles.push(...(page || []))
        if (!page?.length || page.length < 1000) break
      }

      const availableProfiles =
        (allProfiles || []).filter(
          (profile) =>
            !excludedUserIds.has(profile.id)
        )

      // ========================================
      // SCORE PROFILES
      // ========================================

      const projectText = new Map<string, string>()
      if (preference.project_collaborators) {
        // Projects are readable under the existing policies; preferences stay private.
        const ids = [user.id, ...availableProfiles.map(profile => profile.id)]
        for (let base = 0; base < ids.length; base += 100) {
          for (let offset = 0; ; offset += 1000) {
            const { data: page, error: projectError } = await supabase
              .from('projects')
              .select('id,user_id,title,description')
              .in('user_id', ids.slice(base, base + 100))
              .order('id')
              .range(offset, offset + 999)
            if (cancelled) return
            if (projectError) {
              setError(`Could not load project interests: ${projectError.message}`)
              setLoading(false)
              return
            }
            for (const project of page || []) {
              projectText.set(project.user_id, `${projectText.get(project.user_id) || ''} ${project.title || ''} ${project.description || ''}`)
            }
            if (!page?.length || page.length < 1000) break
          }
        }
      }
      const myProjectWords = projectKeywords(projectText.get(user.id) || '')
      const toggles = [preference.same_major, preference.similar_career_interests,
        preference.outside_major, preference.upperclassmen, preference.mentors,
        preference.project_collaborators]
      const maximum = 6 + toggles.filter(Boolean).length * 3
      setPossibleScore(maximum)

      const scoredProfiles: ScoredProfile[] = availableProfiles.map(profile => {
        let score = 0
        const reasons: string[] = []
        // Hidden academic/career details do not contribute revealing match reasons.
        const majorKnown = profile.show_academic_info && !!normalize(myProfile.major) && !!normalize(profile.major)
        const careerKnown = profile.show_career_goal && !!normalize(myProfile.career_goal) && !!normalize(profile.career_goal)
        const sameMajor = majorKnown && normalize(myProfile.major) === normalize(profile.major)
        const sameCareer = careerKnown && normalize(myProfile.career_goal) === normalize(profile.career_goal)
        const sameYear = profile.show_academic_info && !!normalize(myProfile.academic_year)
          && normalize(myProfile.academic_year) === normalize(profile.academic_year)
        const outsideMajor = majorKnown && !sameMajor
        const otherCareer = careerKnown && !sameCareer
        const myYear = academicRank(myProfile.academic_year)
        const theirYear = profile.show_academic_info ? academicRank(profile.academic_year) : 0
        const upperclassman = theirYear >= 3
        const moreExperienced = myYear > 0 && theirYear > myYear

        if (preference.match_style === 'different') {
          if (outsideMajor) score += 3
          if (otherCareer) score += 3
        } else if (preference.match_style === 'balanced') {
          if (sameMajor) score += 2
          if (sameCareer) score += 2
          if (outsideMajor || otherCareer) score += 2
        } else {
          if (sameCareer) score += 3
          if (sameMajor) score += 2
          if (sameYear) score += 1
        }
        if (sameMajor) reasons.push('Same major')
        if (sameCareer) reasons.push('Same career interest')
        if (sameYear) reasons.push('Same academic year')
        if (preference.same_major && sameMajor) score += 3
        if (preference.similar_career_interests && sameCareer) score += 3
        if (preference.outside_major && outsideMajor) {
          score += 3
          reasons.push('Outside your major')
        }
        if (preference.upperclassmen && upperclassman) {
          score += 3
          reasons.push('Upperclassman')
        }
        if (preference.mentors && moreExperienced && sameCareer) {
          score += 3
          reasons.push('More academic experience in your career interest')
        }
        if (preference.project_collaborators) {
          const theirWords = projectKeywords(projectText.get(profile.id) || '')
          const sharedProject = [...myProjectWords].some(word => theirWords.has(word))
          if (sharedProject) {
            score += 3
            reasons.push('Shared project interests')
          }
        }
        if (preference.match_style === 'different' && (outsideMajor || otherCareer)) {
          reasons.push('A new perspective')
        }
        return { profile, score, reasons }
      })

      // Refresh changes the order while keeping compatibility information.
      if (cancelled) return
      const historyKey = `brework:discover-viewed:${user.id}`
      let viewedIds: string[] = []
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem(historyKey) || '[]')
        if (Array.isArray(stored)) {
          viewedIds = stored.filter((id): id is string => typeof id === 'string')
        }
      } catch {
        // Discovery still works when browser storage is unavailable.
      }

      const viewed = new Set(viewedIds)
      const lastViewedId = viewedIds[viewedIds.length - 1]
      // Weighted random order: stronger preference matches are more likely to
      // appear early, but every eligible person remains in the round.
      const shuffled = scoredProfiles
        .map(item => ({ item, priority: -Math.log(Math.max(Math.random(), Number.EPSILON)) / (1 + item.score) }))
        .sort((a, b) => a.priority - b.priority)
        .map(entry => entry.item)
      const fresh = shuffled.filter(item => !viewed.has(item.profile.id))
      const previous = shuffled.filter(item => viewed.has(item.profile.id))
      const ordered = [...fresh, ...previous]

      // After everyone has been viewed, start another shuffled round.
      // Avoid showing the most recently viewed person first when possible.
      if (fresh.length === 0) {
        if (ordered.length > 1 && ordered[0].profile.id === lastViewedId) {
          ;[ordered[0], ordered[1]] = [ordered[1], ordered[0]]
        }
        try {
          sessionStorage.setItem(historyKey, JSON.stringify(lastViewedId ? [lastViewedId] : []))
        } catch {
          // Storage is optional.
        }
      }

      setCurrentIndex(0)
      setProfiles(ordered)
      setLoading(false)
    }

    void loadProfiles()
    return () => { cancelled = true }
  }, [router, round])

  // Re-fetch at the end of each round so new users can appear and new
  // connection requests/blocks are excluded before another round starts.
  useEffect(() => {
    if (!loading && !error && profiles.length > 0 && currentIndex >= profiles.length) {
      setLoading(true)
      setRound(value => value + 1)
    }
  }, [currentIndex, profiles.length, loading, error])

  const currentMatch =
    profiles[currentIndex]

  const currentProfile =
    currentMatch?.profile

  useEffect(() => {
    if (!userId || !currentProfile?.id) return
    const historyKey = `brework:discover-viewed:${userId}`
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(historyKey) || '[]')
      const ids = Array.isArray(stored)
        ? stored.filter((id): id is string => typeof id === 'string')
        : []
      const next = ids.filter(id => id !== currentProfile.id)
      next.push(currentProfile.id)
      sessionStorage.setItem(historyKey, JSON.stringify(next.slice(-2000)))
    } catch {
      // Storage is optional; the order is still shuffled on refresh.
    }
  }, [userId, currentProfile?.id])

  // ============================================
  // SEND CONNECTION REQUEST
  // ============================================

  async function sendConnectionRequest() {
    if (
      !currentProfile ||
      !userId ||
      sending
    ) {
      return
    }

    setSending(true)
    setError('')

    const supabase = createClient()

    // ========================================
    // CHECK FOR BLOCK
    // ========================================

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
        `and(blocker_id.eq.${userId},blocked_id.eq.${currentProfile.id}),and(blocker_id.eq.${currentProfile.id},blocked_id.eq.${userId})`
      )
      .maybeSingle()

    if (blockedRelationshipError) {
      setError(
        `Could not check blocked users: ${blockedRelationshipError.message}`
      )

      setSending(false)
      return
    }

    if (blockedRelationship) {
      setError(
        'You cannot connect with this student.'
      )

      setSending(false)
      return
    }

    // ========================================
    // CHECK FOR EXISTING CONNECTION
    // ========================================

    const {
      data: existingConnection,
      error: existingError,
    } = await supabase
      .from('connections')
      .select(
        'id, sender_id, receiver_id, status'
      )
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${currentProfile.id}),and(sender_id.eq.${currentProfile.id},receiver_id.eq.${userId})`
      )
      .maybeSingle()

    if (existingError) {
      setError(
        `Could not check connection: ${existingError.message}`
      )

      setSending(false)
      return
    }

    if (existingConnection) {
      if (
        existingConnection.status ===
        'accepted'
      ) {
        setError(
          'You are already connected with this student.'
        )
      } else if (
        existingConnection.status ===
        'pending'
      ) {
        setError(
          'A connection request already exists between you and this student.'
        )
      } else {
        setError(
          `A previous connection has status: ${existingConnection.status}.`
        )
      }

      setSending(false)
      return
    }

    // ========================================
    // CREATE CONNECTION REQUEST
    // ========================================

    const {
      error: insertError,
    } = await supabase
      .from('connections')
      .insert({
        sender_id: userId,
        receiver_id: currentProfile.id,
        status: 'pending',
      })

    if (insertError) {
      setError(
        `Could not send connection request: ${insertError.message}`
      )

      setSending(false)
      return
    }

    // ========================================
    // MOVE TO NEXT PROFILE
    // ========================================

    setCurrentIndex(
      (current) => current + 1
    )

    setSending(false)
  }

  // ============================================
  // SKIP
  // ============================================

  function skipProfile() {
    if (
      currentIndex <
      profiles.length
    ) {
      setCurrentIndex(
        (current) => current + 1
      )

      setError('')
    }
  }

  // ============================================
  // MATCH PERCENTAGE
  // ============================================

  function getMatchPercentage(
    score: number
  ) {
    return Math.round(
      (score / possibleScore) * 100
    )
  }

  // ============================================
  // VIEW RESUME
  // ============================================

  async function viewResume(
    resumePath: string
  ) {
    if (!resumePath) {
      return
    }

    setError('')

    const supabase = createClient()

    const {
      data,
      error: signedUrlError,
    } =
      await supabase.storage
        .from('resumes')
        .createSignedUrl(
          resumePath,
          60
        )

    if (
      signedUrlError ||
      !data?.signedUrl
    ) {
      setError(
        `Could not open resume: ${
          signedUrlError?.message ||
          'Signed URL could not be created.'
        }`
      )

      return
    }

    await openExternalUrl(
      data.signedUrl
    )
  }

  // ============================================
  // LOADING
  // ============================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
        <div className="text-center">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
            ☕
          </div>

          <p className="mt-4 text-sm font-medium text-gray-500">
            Finding students for you...
          </p>

        </div>
      </main>
    )
  }

  // ============================================
  // PAGE
  // ============================================

  return (
    <main className="min-h-screen bg-[#f7f7f5] pb-28">

      {/* HEADER */}

      <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/90 backdrop-blur">

        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-6">

          <button
            onClick={() =>
              router.push('/dashboard')
            }
            className="text-xl font-bold tracking-tight transition hover:opacity-70"
          >
            Brework
          </button>

          <button
            onClick={() =>
              router.push('/profile')
            }
            className="rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-black"
          >
            Profile
          </button>

        </div>

      </header>

      {/* MAIN */}

      <div className="mx-auto max-w-xl px-5 py-8 sm:px-6 sm:py-12">

        {/* TITLE */}

        <div className="mb-8">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
                Discover
              </p>

              <h1 className="mt-2 text-4xl font-bold tracking-tight">
                Find your people.
              </h1>

            </div>

          </div>

          <p className="mt-3 max-w-md leading-relaxed text-gray-500">
            Meet students with similar
            interests, goals, and ambitions.
          </p>

        </div>

        {/* ERROR */}

        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">

            <span className="mt-0.5">
              ⚠️
            </span>

            <p>{error}</p>

          </div>
        )}

        {/* EMPTY */}

        {!currentProfile ? (
          <div className="rounded-[2rem] border border-gray-200/70 bg-white p-10 text-center shadow-sm">

            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-50 text-4xl">
              ☕
            </div>

            <h2 className="mt-6 text-2xl font-bold">
              No available profiles right now.
            </h2>

            <p className="mx-auto mt-2 max-w-sm leading-relaxed text-gray-500">
              Everyone available may already be connected, pending,
              or excluded by privacy and block settings. Refresh to
              check for new students.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">

              <button
                onClick={() =>
                  router.push('/connections')
                }
                className="rounded-xl bg-black px-6 py-3 font-semibold text-white transition hover:opacity-90"
              >
                View Connections
              </button>

              <button
                onClick={() =>
                  router.push('/chats')
                }
                className="rounded-xl border border-gray-200 bg-white px-6 py-3 font-semibold transition hover:bg-gray-50"
              >
                View Chats
              </button>

            </div>

          </div>
        ) : (
          <>

            {/* PROFILE CARD */}

            <div className="group overflow-hidden rounded-[2rem] border border-gray-200/70 bg-white shadow-sm transition duration-300 hover:shadow-md">

              {/* PHOTO */}

              <div className="relative aspect-[4/4.5] w-full overflow-hidden bg-gray-100">

                {currentProfile.profile_photo_url ? (
                  <img
                    src={
                      currentProfile.profile_photo_url
                    }
                    alt={`${currentProfile.first_name || 'Student'} profile`}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-100">
                    <span className="text-7xl">
                      👤
                    </span>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

                {/* MATCH BADGE */}

                <div className="absolute left-5 top-5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-gray-800 shadow-sm backdrop-blur">
                  ✨ {getMatchPercentage(currentMatch.score)}% Match
                </div>

                {/* NAME */}

                <div className="absolute bottom-6 left-5 right-5 text-white">

                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    {currentProfile.first_name}{' '}
                    {currentProfile.last_name}
                  </h2>

                  {currentProfile.show_academic_info && (
                    <p className="mt-2 text-sm font-medium text-white/90">
                      {currentProfile.major ||
                        'Major not listed'}

                      {currentProfile.academic_year
                        ? ` • ${currentProfile.academic_year}`
                        : ''}
                    </p>
                  )}

                </div>

              </div>

              {/* INFO */}

              <div className="p-6 sm:p-7">

                {/* WHY YOU MATCH */}

                {currentMatch.reasons.length > 0 && (
                  <div>

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Why you match
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">

                      {currentMatch.reasons.map(
                        (reason) => (
                          <span
                            key={reason}
                            className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700"
                          >
                            {reason}
                          </span>
                        )
                      )}

                    </div>

                  </div>
                )}

                {/* CAREER */}

                {currentProfile.show_career_goal &&
                  currentProfile.career_goal && (
                  <div
                    className={
                      currentMatch.reasons.length > 0
                        ? 'mt-6'
                        : ''
                    }
                  >

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Career interest
                    </p>

                    <div className="mt-2 inline-flex rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-800">
                      {currentProfile.career_goal}
                    </div>

                  </div>
                )}

                {/* BIO */}

                {currentProfile.bio && (
                  <div
                    className={
                      (
                        currentProfile.show_career_goal &&
                        currentProfile.career_goal
                      ) ||
                      currentMatch.reasons.length > 0
                        ? 'mt-6'
                        : ''
                    }
                  >

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      About
                    </p>

                    <p className="mt-2 leading-relaxed text-gray-600">
                      {currentProfile.bio}
                    </p>

                  </div>
                )}

                {/* RESUME */}

                {currentProfile.resume_url && (
                  <div
                    className={
                      currentProfile.bio ||
                      (
                        currentProfile.show_career_goal &&
                        currentProfile.career_goal
                      ) ||
                      currentMatch.reasons.length > 0
                        ? 'mt-6'
                        : ''
                    }
                  >

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Resume
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        viewResume(
                          currentProfile.resume_url as string
                        )
                      }
                      className="mt-3 rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-blue-600 underline underline-offset-2 transition hover:bg-gray-200 hover:text-blue-800"
                    >
                      Resume ↗
                    </button>

                  </div>
                )}

                {/* FALLBACK */}

                {!currentProfile.bio &&
                  !(
                    currentProfile.show_career_goal &&
                    currentProfile.career_goal
                  ) &&
                  currentMatch.reasons.length === 0 && (
                    <p className="text-sm text-gray-400">
                      This student hasn&apos;t added
                      additional information yet.
                    </p>
                  )}

              </div>

            </div>

            {/* ACTIONS */}

            <div className="mt-5 grid grid-cols-2 gap-3">

              <button
                onClick={skipProfile}
                disabled={sending}
                className="rounded-2xl border border-gray-200 bg-white px-5 py-4 font-semibold shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="mr-2">
                  ✕
                </span>

                Skip
              </button>

              <button
                onClick={
                  sendConnectionRequest
                }
                disabled={sending}
                className="rounded-2xl bg-black px-5 py-4 font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="mr-2">
                  ☕
                </span>

                {sending
                  ? 'Sending...'
                  : 'Connect'}
              </button>

            </div>

            {/* HELPER TEXT */}

            <p className="mt-5 text-center text-xs text-gray-400">
              Connect if you&apos;d like to meet
              for coffee or start a conversation.
            </p>

          </>
        )}

      </div>

      {/* BOTTOM NAV */}

      <BottomNav />

    </main>
  )
}