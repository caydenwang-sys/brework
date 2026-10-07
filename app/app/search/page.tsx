'use client'

import {
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BottomNav from '../components/BottomNav'

function ExpandableProfilePhoto({ src, name }: { src: string; name: string }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [origin, setOrigin] = useState<{ top: number; left: number; size: number } | null>(null)
  const [expanded, setExpanded] = useState(false)

  function close() {
    if (timer.current) return
    setExpanded(false)
    timer.current = setTimeout(() => {
      setOrigin(null)
      timer.current = null
      trigger.current?.focus({ preventScroll: true })
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220)
  }

  useEffect(() => {
    if (!origin) return
    const frame = requestAnimationFrame(() => setExpanded(true))
    closeButton.current?.focus({ preventScroll: true })
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        closeButton.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [origin])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`Enlarge ${name}'s profile photo`}
        onClick={() => {
          const rect = trigger.current?.getBoundingClientRect()
          if (rect) setOrigin({ top: rect.top, left: rect.left, size: rect.width })
        }}
        className="h-full w-full rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
      >
        <img src={src} alt={`${name} profile`} className="h-full w-full rounded-full object-cover" />
      </button>
      {origin && createPortal(
        <div role="dialog" aria-modal="true" aria-label={`${name}'s profile photo`} className="fixed inset-0 z-[100]">
          <button
            ref={closeButton}
            type="button"
            aria-label="Close enlarged profile photo"
            onClick={close}
            className="absolute inset-0 h-full w-full motion-reduce:transition-none"
            style={{ backgroundColor: expanded ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0)', transition: 'background-color 220ms ease' }}
          />
          <img
            src={src}
            alt={`${name} profile`}
            className="pointer-events-none fixed rounded-full object-cover shadow-2xl motion-reduce:transition-none"
            style={{
              top: expanded ? '50%' : origin.top,
              left: expanded ? '50%' : origin.left,
              width: expanded ? 'min(80vw, 60vh, 420px)' : origin.size,
              height: expanded ? 'min(80vw, 60vh, 420px)' : origin.size,
              transform: expanded ? 'translate(-50%, -50%)' : 'translate(0, 0)',
              transition: 'top 220ms ease, left 220ms ease, width 220ms ease, height 220ms ease, transform 220ms ease',
            }}
          />
          <p className="pointer-events-none absolute inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))] text-center text-sm" style={{ color: '#fff' }}>
            Tap anywhere to close
          </p>
        </div>, document.body
      )}
    </>
  )
}

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
}

type Interest = {
  id: number
  name: string
  category: string | null
}

type Club = {
  id: number
  name: string
  description: string | null
}

type WorkExperience = {
  id: number
  user_id: string
  company_name: string
  role_title: string | null
  industry: string | null
  description: string | null
  start_date: string | null
  end_date: string | null
  is_current: boolean
}

type Project = {
  id: number
  user_id: string
  title: string
  description: string | null
  created_at: string
}

type MatchPreferences = {
  user_id: string
  same_major: boolean | null
  similar_career_interests: boolean | null
  outside_major: boolean | null
  upperclassmen: boolean | null
  mentors: boolean | null
  project_collaborators: boolean | null
  frequency: string | null
  match_style: string | null
}

type SearchResult = {
  profile: Profile
  interests: Interest[]
  sharedInterests: Interest[]
  clubs: Club[]
  sharedClubs: Club[]
  workExperience: WorkExperience[]
  matchedWorkExperience: WorkExperience | null
  projects: Project[]
  matchedProject: Project | null
  searchScore: number
  compatibilityScore: number
  combinedScore: number
  matchPercentage: number
  searchReasons: string[]
  compatibilityReasons: string[]
}

export default function SearchPage() {
  const router = useRouter()

  const [query, setQuery] =
    useState('')

  const [userId, setUserId] =
    useState('')

  const [myProfile, setMyProfile] =
    useState<Profile | null>(null)

  const [myInterests, setMyInterests] =
    useState<Interest[]>([])

  const [
    matchPreferences,
    setMatchPreferences,
  ] =
    useState<MatchPreferences | null>(
      null
    )

  const [results, setResults] =
    useState<SearchResult[]>([])

  const [loading, setLoading] =
    useState(true)

  const [sendingId, setSendingId] =
    useState<string | null>(null)

  const [sentIds, setSentIds] =
    useState<Set<string>>(
      new Set()
    )

  const [
    connectionStatuses,
    setConnectionStatuses,
  ] = useState<
    Record<string, string>
  >({})

  const [error, setError] =
    useState('')

  const [showFilters, setShowFilters] =
    useState(false)

  const [majorFilter, setMajorFilter] =
    useState('')

  const [academicYearFilter, setAcademicYearFilter] =
    useState('')

  const [careerFilter, setCareerFilter] =
    useState('')

  const [clubFilter, setClubFilter] =
    useState('')

  const [interestFilter, setInterestFilter] =
    useState('')

  const [companyFilter, setCompanyFilter] =
    useState('')

  const [industryFilter, setIndustryFilter] =
    useState('')

  const [minimumMatch, setMinimumMatch] =
    useState(0)

  const [sortBy, setSortBy] =
    useState<
      'best' |
      'relevance' |
      'compatibility'
    >('best')

  const [selectedResult, setSelectedResult] =
    useState<SearchResult | null>(null)

  const [recentSearches, setRecentSearches] =
    useState<string[]>([])

  // ============================================
  // LOCK PAGE SCROLL WHILE PROFILE MODAL IS OPEN
  // ============================================

  useEffect(() => {
    if (!selectedResult) {
      return
    }

    const previousOverflow =
      document.body.style.overflow

    document.body.style.overflow =
      'hidden'

    return () => {
      document.body.style.overflow =
        previousOverflow
    }
  }, [selectedResult])

  // ============================================
  // LOAD RECENT SEARCHES
  // ============================================

  useEffect(() => {
    if (!userId) {
      setRecentSearches([])
      return
    }

    try {
      const stored =
        window.localStorage.getItem(
          `brewlink-recent-searches-${userId}`
        )

      if (!stored) {
        setRecentSearches([])
        return
      }

      const parsed =
        JSON.parse(stored)

      if (Array.isArray(parsed)) {
        setRecentSearches(
          parsed
            .filter(
              (item) =>
                typeof item ===
                'string'
            )
            .slice(0, 8)
        )
      } else {
        setRecentSearches([])
      }
    } catch (recentSearchError) {
      console.error(
        'Could not load recent searches:',
        recentSearchError
      )

      setRecentSearches([])
    }
  }, [userId])

  // ============================================
  // SAVE RECENT SEARCH
  // ============================================

  function saveRecentSearch(
    value: string
  ) {
    const cleaned =
      value.trim()

    if (
      !cleaned ||
      !userId
    ) {
      return
    }

    setRecentSearches(
      (current) => {
        const next = [
          cleaned,
          ...current.filter(
            (item) =>
              item.toLowerCase() !==
              cleaned.toLowerCase()
          ),
        ].slice(0, 8)

        try {
          window.localStorage.setItem(
            `brewlink-recent-searches-${userId}`,
            JSON.stringify(next)
          )
        } catch (
          recentSearchError
        ) {
          console.error(
            'Could not save recent search:',
            recentSearchError
          )
        }

        return next
      }
    )
  }

  function removeRecentSearch(
    value: string
  ) {
    if (!userId) {
      return
    }

    setRecentSearches(
      (current) => {
        const next =
          current.filter(
            (item) =>
              item !== value
          )

        try {
          window.localStorage.setItem(
            `brewlink-recent-searches-${userId}`,
            JSON.stringify(next)
          )
        } catch (
          recentSearchError
        ) {
          console.error(
            'Could not update recent searches:',
            recentSearchError
          )
        }

        return next
      }
    )
  }

  function clearRecentSearches() {
    setRecentSearches([])

    if (!userId) {
      return
    }

    try {
      window.localStorage.removeItem(
        `brewlink-recent-searches-${userId}`
      )

      window.localStorage.removeItem(
        'brewlink-recent-searches'
      )
    } catch (
      recentSearchError
    ) {
      console.error(
        'Could not clear recent searches:',
        recentSearchError
      )
    }
  }

  // ============================================
  // LOAD SEARCH DATA
  // ============================================

  useEffect(() => {
    async function loadSearchData() {
      const supabase = createClient()

      setLoading(true)
      setError('')

      // ========================================
      // CURRENT USER
      // ========================================

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

      // ========================================
      // MY PROFILE
      // ========================================

      // Independent reads run together; existing validation and state updates stay below.
      const initialLoadResults = await Promise.all([
        supabase
          .from('profiles')
          .select(`
            id,
            first_name,
            last_name,
            major,
            academic_year,
            bio,
            career_goal,
            profile_photo_url,
            is_discoverable,
            show_academic_info,
            show_career_goal
          `)
          .eq('id', user.id)
          .single(),
        supabase
          .from(
            'match_preferences'
          )
          .select(`
            user_id,
            same_major,
            similar_career_interests,
            outside_major,
            upperclassmen,
            mentors,
            project_collaborators,
            frequency,
            match_style
          `)
          .eq(
            'user_id',
            user.id
          )
          .maybeSingle(),
        supabase
          .from('connections')
          .select(`
            sender_id,
            receiver_id,
            status
          `)
          .or(
            `sender_id.eq.${user.id},receiver_id.eq.${user.id}`
          ),
        supabase
          .from('blocked_users')
          .select(`
            blocker_id,
            blocked_id
          `)
          .or(
            `blocker_id.eq.${user.id},blocked_id.eq.${user.id}`
          )
      ])

      const {
        data: currentProfile,
        error: currentProfileError,
      } =
        initialLoadResults[0]

      if (
        currentProfileError ||
        !currentProfile
      ) {
        setError(
          `Could not load your profile: ${
            currentProfileError?.message ||
            'Profile not found'
          }`
        )

        setLoading(false)
        return
      }

      setMyProfile(
        currentProfile as Profile
      )

      // ========================================
      // MATCH PREFERENCES
      // ========================================

      const {
        data: preferenceData,
        error: preferenceError,
      } =
        initialLoadResults[1]

      if (preferenceError) {
        console.error(
          'Could not load match preferences:',
          preferenceError
        )
      } else {
        setMatchPreferences(
          preferenceData as MatchPreferences | null
        )
      }

      // ========================================
      // EXISTING CONNECTIONS
      // ========================================

      const {
        data: connections,
        error: connectionsError,
      } =
        initialLoadResults[2]

      if (connectionsError) {
        setError(
          `Could not load connections: ${connectionsError.message}`
        )

        setLoading(false)
        return
      }

      // ========================================
      // BLOCKED RELATIONSHIPS
      // ========================================

      const {
        data: blockedRelationships,
        error: blockedRelationshipsError,
      } =
        initialLoadResults[3]

      if (blockedRelationshipsError) {
        setError(
          `Could not load blocked users: ${blockedRelationshipsError.message}`
        )

        setLoading(false)
        return
      }

      const excludedIds =
        new Set<string>()

      const nextConnectionStatuses:
        Record<string, string> = {}

      for (
        const connection of
          connections || []
      ) {
        const otherUserId =
          connection.sender_id ===
          user.id
            ? connection.receiver_id
            : connection.sender_id

        nextConnectionStatuses[
          otherUserId
        ] = connection.status
      }

      setConnectionStatuses(
        nextConnectionStatuses
      )

      for (
        const blockedRelationship of
          blockedRelationships || []
      ) {
        const otherUserId =
          blockedRelationship.blocker_id ===
          user.id
            ? blockedRelationship.blocked_id
            : blockedRelationship.blocker_id

        excludedIds.add(
          otherUserId
        )
      }

      // ========================================
      // LOAD DISCOVERABLE PROFILES
      // ========================================

      const {
        data: profileData,
        error: profilesError,
      } =
        await supabase
          .from('profiles')
          .select(`
            id,
            first_name,
            last_name,
            major,
            academic_year,
            bio,
            career_goal,
            profile_photo_url,
            is_discoverable,
            show_academic_info,
            show_career_goal
          `)
          .neq('id', user.id)
          .eq(
            'is_discoverable',
            true
          )

      if (profilesError) {
        setError(
          `Could not load students: ${profilesError.message}`
        )

        setLoading(false)
        return
      }

      const availableProfiles =
        (
          profileData || []
        ).filter(
          (profile) =>
            !excludedIds.has(
              profile.id
            )
        ) as Profile[]

      // ========================================
      // PROFILE IDS
      // ========================================

      const profileIds = [
        user.id,
        ...availableProfiles.map(
          (profile) =>
            profile.id
        ),
      ]

      // ========================================
      // LOAD INTERESTS
      // ========================================

      const detailLoadResults = await Promise.all([
        supabase
          .from('user_interests')
          .select(`
            user_id,
            interest_id
          `)
          .in(
            'user_id',
            profileIds
          ),
        supabase
          .from('user_clubs')
          .select(`
            user_id,
            club_id
          `)
          .in(
            'user_id',
            profileIds
          ),
        supabase
          .from(
            'work_experience'
          )
          .select(`
            id,
            user_id,
            company_name,
            role_title,
            industry,
            description,
            start_date,
            end_date,
            is_current
          `)
          .in(
            'user_id',
            profileIds
          ),
        supabase
          .from(
            'projects'
          )
          .select(`
            id,
            user_id,
            title,
            description,
            created_at
          `)
          .in(
            'user_id',
            profileIds
          )
      ])

      const {
        data: userInterestRows,
        error: userInterestError,
      } =
        detailLoadResults[0]

      if (userInterestError) {
        setError(
          `Could not load interests: ${userInterestError.message}`
        )

        setLoading(false)
        return
      }

      const interestIds = [
        ...new Set(
          (
            userInterestRows ||
            []
          ).map(
            (row) =>
              row.interest_id
          )
        ),
      ]

      let interestData:
        Interest[] = []

      if (
        interestIds.length > 0
      ) {
        const {
          data,
          error:
            interestLookupError,
        } =
          await supabase
            .from(
              'interests'
            )
            .select(`
              id,
              name,
              category
            `)
            .in(
              'id',
              interestIds
            )

        if (
          interestLookupError
        ) {
          setError(
            `Could not load interest details: ${interestLookupError.message}`
          )

          setLoading(false)
          return
        }

        interestData =
          (data ||
            []) as Interest[]
      }

      // ========================================
      // BUILD USER INTEREST MAP
      // ========================================

      const interestMap:
        Record<
          string,
          Interest[]
        > = {}

      for (
        const row of
          userInterestRows || []
      ) {
        const interest =
          interestData.find(
            (item) =>
              item.id ===
              row.interest_id
          )

        if (!interest) {
          continue
        }

        if (
          !interestMap[
            row.user_id
          ]
        ) {
          interestMap[
            row.user_id
          ] = []
        }

        interestMap[
          row.user_id
        ].push(interest)
      }

      const currentUserInterests =
        interestMap[
          user.id
        ] || []

      setMyInterests(
        currentUserInterests
      )

      // ========================================
      // LOAD CLUBS
      // ========================================

      const {
        data: userClubRows,
        error: userClubError,
      } =
        detailLoadResults[1]

      if (userClubError) {
        setError(
          `Could not load clubs: ${userClubError.message}`
        )

        setLoading(false)
        return
      }

      const clubIds = [
        ...new Set(
          (
            userClubRows ||
            []
          ).map(
            (row) =>
              row.club_id
          )
        ),
      ]

      let clubData:
        Club[] = []

      if (
        clubIds.length > 0
      ) {
        const {
          data,
          error:
            clubLookupError,
        } =
          await supabase
            .from('clubs')
            .select(`
              id,
              name,
              description
            `)
            .in(
              'id',
              clubIds
            )

        if (
          clubLookupError
        ) {
          setError(
            `Could not load club details: ${clubLookupError.message}`
          )

          setLoading(false)
          return
        }

        clubData =
          (data ||
            []) as Club[]
      }

      // ========================================
      // BUILD USER CLUB MAP
      // ========================================

      const clubMap:
        Record<
          string,
          Club[]
        > = {}

      for (
        const row of
          userClubRows || []
      ) {
        const club =
          clubData.find(
            (item) =>
              item.id ===
              row.club_id
          )

        if (!club) {
          continue
        }

        if (
          !clubMap[
            row.user_id
          ]
        ) {
          clubMap[
            row.user_id
          ] = []
        }

        clubMap[
          row.user_id
        ].push(club)
      }

      const currentUserClubs =
        clubMap[
          user.id
        ] || []

      // ========================================
      // LOAD WORK EXPERIENCE
      // ========================================

      const {
        data: workExperienceRows,
        error: workExperienceError,
      } =
        detailLoadResults[2]

      if (workExperienceError) {
        setError(
          `Could not load work experience: ${workExperienceError.message}`
        )

        setLoading(false)
        return
      }

      const workExperienceMap:
        Record<
          string,
          WorkExperience[]
        > = {}

      for (
        const experience of
          workExperienceRows || []
      ) {
        if (
          !workExperienceMap[
            experience.user_id
          ]
        ) {
          workExperienceMap[
            experience.user_id
          ] = []
        }

        workExperienceMap[
          experience.user_id
        ].push(
          experience as WorkExperience
        )
      }

      // ========================================
      // LOAD PROJECTS
      // ========================================

      const {
        data: projectRows,
        error: projectError,
      } =
        detailLoadResults[3]

      if (projectError) {
        setError(
          `Could not load projects: ${projectError.message}`
        )

        setLoading(false)
        return
      }

      const projectMap:
        Record<
          string,
          Project[]
        > = {}

      for (
        const project of
          projectRows || []
      ) {
        if (
          !projectMap[
            project.user_id
          ]
        ) {
          projectMap[
            project.user_id
          ] = []
        }

        projectMap[
          project.user_id
        ].push(
          project as Project
        )
      }

      // ========================================
      // PREPARE BASE RESULTS
      // ========================================

      const preparedResults:
        SearchResult[] =
          availableProfiles.map(
            (profile) => {
              const interests =
                interestMap[
                  profile.id
                ] || []

              const sharedInterests =
                interests.filter(
                  (interest) =>
                    currentUserInterests.some(
                      (
                        myInterest
                      ) =>
                        myInterest.id ===
                        interest.id
                    )
                )

              const clubs =
                clubMap[
                  profile.id
                ] || []

              const sharedClubs =
                clubs.filter(
                  (club) =>
                    currentUserClubs.some(
                      (
                        myClub
                      ) =>
                        myClub.id ===
                        club.id
                    )
                )

              const workExperience =
                workExperienceMap[
                  profile.id
                ] || []

              const projects =
                projectMap[
                  profile.id
                ] || []

              let compatibilityScore =
                0

              const compatibilityReasons:
                string[] = []

              // --------------------------------
              // SAME CAREER GOAL
              // --------------------------------

              if (
                currentProfile.career_goal &&
                profile.career_goal &&
                currentProfile.career_goal
                  .trim()
                  .toLowerCase() ===
                  profile.career_goal
                    .trim()
                    .toLowerCase()
              ) {
                compatibilityScore +=
                  3

                compatibilityReasons.push(
                  'Same career interest'
                )
              }

              // --------------------------------
              // SAME MAJOR
              // --------------------------------

              if (
                currentProfile.major &&
                profile.major &&
                currentProfile.major
                  .trim()
                  .toLowerCase() ===
                  profile.major
                    .trim()
                    .toLowerCase()
              ) {
                compatibilityScore +=
                  2

                compatibilityReasons.push(
                  'Same major'
                )
              }

              // --------------------------------
              // SAME ACADEMIC YEAR
              // --------------------------------

              if (
                currentProfile.academic_year &&
                profile.academic_year &&
                currentProfile.academic_year
                  .trim()
                  .toLowerCase() ===
                  profile.academic_year
                    .trim()
                    .toLowerCase()
              ) {
                compatibilityScore +=
                  1

                compatibilityReasons.push(
                  'Same academic year'
                )
              }

              // --------------------------------
              // SHARED INTERESTS
              // --------------------------------

              if (
                sharedInterests.length >
                0
              ) {
                compatibilityScore +=
                  Math.min(
                    sharedInterests.length *
                      2,
                    6
                  )

                compatibilityReasons.push(
                  `${
                    sharedInterests.length
                  } shared ${
                    sharedInterests.length ===
                    1
                      ? 'interest'
                      : 'interests'
                  }`
                )
              }

              // --------------------------------
              // SHARED CLUBS
              // --------------------------------

              if (
                sharedClubs.length >
                0
              ) {
                compatibilityScore +=
                  Math.min(
                    sharedClubs.length *
                      2,
                    4
                  )

                compatibilityReasons.push(
                  `${
                    sharedClubs.length
                  } shared ${
                    sharedClubs.length ===
                    1
                      ? 'club'
                      : 'clubs'
                  }`
                )
              }

              const maxCompatibilityScore =
                16

              const matchPercentage =
                Math.min(
                  100,
                  Math.round(
                    (
                      compatibilityScore /
                      maxCompatibilityScore
                    ) * 100
                  )
                )

              return {
                profile,
                interests,
                sharedInterests,
                clubs,
                sharedClubs,
                workExperience,
                matchedWorkExperience:
                  null,
                projects,
                matchedProject:
                  null,
                searchScore: 0,
                compatibilityScore,
                combinedScore:
                  compatibilityScore,
                matchPercentage,
                searchReasons:
                  [],
                compatibilityReasons,
              }
            }
          )

      setResults(
        preparedResults
      )

      setLoading(false)
    }

    loadSearchData()
  }, [router])

  // ============================================
  // NORMALIZE TEXT
  // ============================================

  function normalize(
    value:
      | string
      | null
      | undefined
  ) {
    return (
      value
        ?.trim()
        .toLowerCase() || ''
    )
  }

  // ============================================
  // FUZZY SEARCH HELPERS
  // ============================================

  function levenshteinDistance(
    first: string,
    second: string
  ) {
    const a = normalize(first)
    const b = normalize(second)

    if (!a.length) return b.length
    if (!b.length) return a.length

    const matrix = Array.from(
      { length: b.length + 1 },
      () =>
        new Array<number>(
          a.length + 1
        ).fill(0)
    )

    for (
      let i = 0;
      i <= a.length;
      i++
    ) {
      matrix[0][i] = i
    }

    for (
      let j = 0;
      j <= b.length;
      j++
    ) {
      matrix[j][0] = j
    }

    for (
      let j = 1;
      j <= b.length;
      j++
    ) {
      for (
        let i = 1;
        i <= a.length;
        i++
      ) {
        const cost =
          a[i - 1] === b[j - 1]
            ? 0
            : 1

        matrix[j][i] =
          Math.min(
            matrix[j - 1][i] + 1,
            matrix[j][i - 1] + 1,
            matrix[j - 1][i - 1] +
              cost
          )
      }
    }

    return matrix[b.length][a.length]
  }

  function fuzzyWordMatch(
    queryWord: string,
    targetWord: string
  ) {
    const query =
      normalize(queryWord)

    const target =
      normalize(targetWord)

    if (!query || !target) {
      return false
    }

    if (query === target) {
      return true
    }

    if (
      target.includes(query) ||
      query.includes(target)
    ) {
      return true
    }

    if (
      query.length <= 2 ||
      target.length <= 2
    ) {
      return false
    }

    const distance =
      levenshteinDistance(
        query,
        target
      )

    const longestLength =
      Math.max(
        query.length,
        target.length
      )

    const similarity =
      1 -
      distance /
        longestLength

    if (longestLength <= 5) {
      return similarity >= 0.75
    }

    return similarity >= 0.7
  }

  function fuzzyTextMatch(
    queryValue:
      | string
      | null
      | undefined,
    targetValue:
      | string
      | null
      | undefined
  ) {
    const query =
      normalize(queryValue)

    const target =
      normalize(targetValue)

    if (!query || !target) {
      return false
    }

    if (query === target) {
      return true
    }

    if (
      target.includes(query) ||
      query.includes(target)
    ) {
      return true
    }

    const queryWords =
      query
        .split(/\s+/)
        .filter(Boolean)

    const targetWords =
      target
        .split(/\s+/)
        .filter(Boolean)

    return queryWords.every(
      (queryWord) =>
        targetWords.some(
          (targetWord) =>
            fuzzyWordMatch(
              queryWord,
              targetWord
            )
        )
    )
  }

  function getTextMatchStrength(
    queryValue:
      | string
      | null
      | undefined,
    targetValue:
      | string
      | null
      | undefined
  ) {
    const query =
      normalize(queryValue)

    const target =
      normalize(targetValue)

    if (!query || !target) {
      return 0
    }

    if (query === target) {
      return 1
    }

    if (
      target.includes(query) ||
      query.includes(target)
    ) {
      return 0.9
    }

    if (
      fuzzyTextMatch(
        query,
        target
      )
    ) {
      return 0.7
    }

    return 0
  }

  // ============================================
  // FILTER OPTIONS
  // ============================================

  const filterOptions =
    useMemo(() => {
      function uniqueSorted(
        values: Array<
          string |
          null |
          undefined
        >
      ) {
        return [
          ...new Set(
            values
              .map(
                (value) =>
                  value?.trim() || ''
              )
              .filter(Boolean)
          ),
        ].sort(
          (a, b) =>
            a.localeCompare(b)
        )
      }

      return {
        majors: uniqueSorted(
          results.map(
            (result) =>
              result.profile.major
          )
        ),
        academicYears:
          uniqueSorted(
            results.map(
              (result) =>
                result.profile
                  .academic_year
            )
          ),
        careers: uniqueSorted(
          results.map(
            (result) =>
              result.profile
                .career_goal
          )
        ),
        clubs: uniqueSorted(
          results.flatMap(
            (result) =>
              result.clubs.map(
                (club) =>
                  club.name
              )
          )
        ),
        interests: uniqueSorted(
          results.flatMap(
            (result) =>
              result.interests.map(
                (interest) =>
                  interest.name
              )
          )
        ),
        companies: uniqueSorted(
          results.flatMap(
            (result) =>
              result.workExperience.map(
                (experience) =>
                  experience.company_name
              )
          )
        ),
        industries: uniqueSorted(
          results.flatMap(
            (result) =>
              result.workExperience.map(
                (experience) =>
                  experience.industry
              )
          )
        ),
      }
    }, [results])

  const activeFilterCount =
    [
      majorFilter,
      academicYearFilter,
      careerFilter,
      clubFilter,
      interestFilter,
      companyFilter,
      industryFilter,
      minimumMatch > 0
        ? String(minimumMatch)
        : '',
    ].filter(Boolean).length

  function clearFilters() {
    setMajorFilter('')
    setAcademicYearFilter('')
    setCareerFilter('')
    setClubFilter('')
    setInterestFilter('')
    setCompanyFilter('')
    setIndustryFilter('')
    setMinimumMatch(0)
    setSortBy('best')
  }

  // ============================================
  // SEARCH RESULTS
  // ============================================

  const filteredResults =
    useMemo(() => {
      const normalizedQuery =
        normalize(query)

      const hasActiveFilters =
        activeFilterCount > 0

      if (
        !normalizedQuery &&
        !hasActiveFilters
      ) {
        return []
      }

      const scored =
        results
          .map((result) => {
            const profile =
              result.profile

            let searchScore = 0

            const searchReasons:
              string[] = []

            const firstName =
              normalize(
                profile.first_name
              )

            const lastName =
              normalize(
                profile.last_name
              )

            const fullName =
              normalize(
                `${
                  profile.first_name ||
                  ''
                } ${
                  profile.last_name ||
                  ''
                }`
              )

            const major =
              normalize(
                profile.major
              )

            const academicYear =
              normalize(
                profile.academic_year
              )

            const careerGoal =
              normalize(
                profile.career_goal
              )

            const bio =
              normalize(
                profile.bio
              )

            // ==================================
            // NAME
            // ==================================

            if (
              fullName ===
              normalizedQuery
            ) {
              searchScore +=
                12

              searchReasons.push(
                'Exact name match'
              )
            } else if (
              firstName ===
                normalizedQuery ||
              lastName ===
                normalizedQuery
            ) {
              searchScore +=
                10

              searchReasons.push(
                'Name match'
              )
            } else if (
              fullName.includes(
                normalizedQuery
              )
            ) {
              searchScore +=
                8

              searchReasons.push(
                'Name match'
              )
            }

            // ==================================
            // CAREER GOAL
            // ==================================

            if (
              careerGoal ===
              normalizedQuery
            ) {
              searchScore +=
                9

              searchReasons.push(
                'Career interest match'
              )
            } else if (
              careerGoal.includes(
                normalizedQuery
              )
            ) {
              searchScore +=
                7

              searchReasons.push(
                'Career interest match'
              )
            }

            // ==================================
            // MAJOR
            // ==================================

            if (
              major ===
              normalizedQuery
            ) {
              searchScore +=
                8

              searchReasons.push(
                'Major match'
              )
            } else if (
              major.includes(
                normalizedQuery
              )
            ) {
              searchScore +=
                6

              searchReasons.push(
                'Major match'
              )
            }

            // ==================================
            // INTERESTS
            // ==================================

            const matchingInterests =
              result.interests
                .map((interest) => {
                  const nameStrength =
                    getTextMatchStrength(
                      normalizedQuery,
                      interest.name
                    )

                  const categoryStrength =
                    getTextMatchStrength(
                      normalizedQuery,
                      interest.category
                    )

                  return {
                    interest,
                    strength:
                      Math.max(
                        nameStrength,
                        categoryStrength
                      ),
                  }
                })
                .filter(
                  (item) =>
                    item.strength > 0
                )
                .sort(
                  (a, b) =>
                    b.strength -
                    a.strength
                )

            if (
              matchingInterests.length >
              0
            ) {
              const bestInterest =
                matchingInterests[0]

              searchScore +=
                Math.round(
                  9 *
                    bestInterest.strength
                )

              searchReasons.push(
                `Interest: ${bestInterest.interest.name}`
              )
            }

            // ==================================
            // CLUBS
            // ==================================

            const matchingClubs =
              result.clubs
                .map((club) => {
                  const nameStrength =
                    getTextMatchStrength(
                      normalizedQuery,
                      club.name
                    )

                  const descriptionStrength =
                    getTextMatchStrength(
                      normalizedQuery,
                      club.description
                    )

                  return {
                    club,
                    strength:
                      Math.max(
                        nameStrength,
                        descriptionStrength
                      ),
                  }
                })
                .filter(
                  (item) =>
                    item.strength > 0
                )
                .sort(
                  (a, b) =>
                    b.strength -
                    a.strength
                )

            if (
              matchingClubs.length > 0
            ) {
              const bestClub =
                matchingClubs[0]

              searchScore +=
                Math.round(
                  10 *
                    bestClub.strength
                )

              searchReasons.push(
                `Club: ${bestClub.club.name}`
              )
            }

            // ==================================
            // WORK EXPERIENCE
            // ==================================

            const matchingWorkExperience =
              result.workExperience
                .map(
                  (
                    experience
                  ) => {
                    const companyStrength =
                      getTextMatchStrength(
                        normalizedQuery,
                        experience.company_name
                      )

                    const roleStrength =
                      getTextMatchStrength(
                        normalizedQuery,
                        experience.role_title
                      )

                    const industryStrength =
                      getTextMatchStrength(
                        normalizedQuery,
                        experience.industry
                      )

                    const descriptionStrength =
                      getTextMatchStrength(
                        normalizedQuery,
                        experience.description
                      )

                    const bestStrength =
                      Math.max(
                        companyStrength,
                        roleStrength,
                        industryStrength,
                        descriptionStrength
                      )

                    let weightedScore =
                      0

                    let reason =
                      ''

                    if (
                      companyStrength > 0
                    ) {
                      weightedScore =
                        Math.max(
                          weightedScore,
                          11 *
                            companyStrength
                        )

                      if (
                        companyStrength ===
                        bestStrength
                      ) {
                        reason =
                          `Company: ${experience.company_name}`
                      }
                    }

                    if (
                      roleStrength > 0
                    ) {
                      weightedScore =
                        Math.max(
                          weightedScore,
                          10 *
                            roleStrength
                        )

                      if (
                        roleStrength ===
                          bestStrength &&
                        !reason
                      ) {
                        reason =
                          `Role: ${
                            experience.role_title ||
                            'Work experience'
                          }`
                      }
                    }

                    if (
                      industryStrength > 0
                    ) {
                      weightedScore =
                        Math.max(
                          weightedScore,
                          8 *
                            industryStrength
                        )

                      if (
                        industryStrength ===
                          bestStrength &&
                        !reason
                      ) {
                        reason =
                          `Industry: ${
                            experience.industry ||
                            'Work experience'
                          }`
                      }
                    }

                    if (
                      descriptionStrength >
                      0
                    ) {
                      weightedScore =
                        Math.max(
                          weightedScore,
                          4 *
                            descriptionStrength
                        )

                      if (
                        descriptionStrength ===
                          bestStrength &&
                        !reason
                      ) {
                        reason =
                          `Experience at ${experience.company_name}`
                      }
                    }

                    return {
                      experience,
                      strength:
                        bestStrength,
                      weightedScore,
                      reason,
                    }
                  }
                )
                .filter(
                  (item) =>
                    item.strength >
                    0
                )
                .sort(
                  (a, b) =>
                    b.weightedScore -
                    a.weightedScore
                )

            const bestWorkExperience =
              matchingWorkExperience[0]

            if (
              bestWorkExperience
            ) {
              searchScore +=
                Math.round(
                  bestWorkExperience.weightedScore
                )

              if (
                bestWorkExperience.reason
              ) {
                searchReasons.push(
                  bestWorkExperience.reason
                )
              }
            }

            // ==================================
            // PROJECTS
            // ==================================

            const matchingProjects =
              result.projects
                .map(
                  (project) => {
                    const titleStrength =
                      getTextMatchStrength(
                        normalizedQuery,
                        project.title
                      )

                    const descriptionStrength =
                      getTextMatchStrength(
                        normalizedQuery,
                        project.description
                      )

                    const bestStrength =
                      Math.max(
                        titleStrength,
                        descriptionStrength
                      )

                    let weightedScore =
                      0

                    let reason =
                      ''

                    if (
                      titleStrength > 0
                    ) {
                      weightedScore =
                        Math.max(
                          weightedScore,
                          10 *
                            titleStrength
                        )

                      if (
                        titleStrength ===
                        bestStrength
                      ) {
                        reason =
                          `Project: ${project.title}`
                      }
                    }

                    if (
                      descriptionStrength >
                      0
                    ) {
                      weightedScore =
                        Math.max(
                          weightedScore,
                          5 *
                            descriptionStrength
                        )

                      if (
                        descriptionStrength ===
                          bestStrength &&
                        !reason
                      ) {
                        reason =
                          `Project: ${project.title}`
                      }
                    }

                    return {
                      project,
                      strength:
                        bestStrength,
                      weightedScore,
                      reason,
                    }
                  }
                )
                .filter(
                  (item) =>
                    item.strength >
                    0
                )
                .sort(
                  (a, b) =>
                    b.weightedScore -
                    a.weightedScore
                )

            const bestProject =
              matchingProjects[0]

            if (
              bestProject
            ) {
              searchScore +=
                Math.round(
                  bestProject.weightedScore
                )

              if (
                bestProject.reason
              ) {
                searchReasons.push(
                  bestProject.reason
                )
              }
            }

            // ==================================
            // ACADEMIC YEAR
            // ==================================

            if (
              academicYear ===
              normalizedQuery
            ) {
              searchScore +=
                5

              searchReasons.push(
                'Academic year match'
              )
            } else if (
              academicYear.includes(
                normalizedQuery
              )
            ) {
              searchScore +=
                3

              searchReasons.push(
                'Academic year match'
              )
            }

            // ==================================
            // BIO
            // ==================================

            if (
              bio.includes(
                normalizedQuery
              )
            ) {
              searchScore +=
                2

              searchReasons.push(
                'Mentioned in bio'
              )
            }

            // ==================================
            // FILTERS
            // ==================================

            const matchesMajorFilter =
              !majorFilter ||
              getTextMatchStrength(
                majorFilter,
                profile.major
              ) > 0

            const matchesAcademicYearFilter =
              !academicYearFilter ||
              academicYear ===
                normalize(
                  academicYearFilter
                )

            const matchesCareerFilter =
              !careerFilter ||
              getTextMatchStrength(
                careerFilter,
                profile.career_goal
              ) > 0

            const matchesClubFilter =
              !clubFilter ||
              result.clubs.some(
                (club) =>
                  getTextMatchStrength(
                    clubFilter,
                    club.name
                  ) > 0 ||
                  getTextMatchStrength(
                    clubFilter,
                    club.description
                  ) > 0
              )

            const matchesInterestFilter =
              !interestFilter ||
              result.interests.some(
                (interest) =>
                  getTextMatchStrength(
                    interestFilter,
                    interest.name
                  ) > 0 ||
                  getTextMatchStrength(
                    interestFilter,
                    interest.category
                  ) > 0
              )

            const matchesCompanyFilter =
              !companyFilter ||
              result.workExperience.some(
                (experience) =>
                  getTextMatchStrength(
                    companyFilter,
                    experience.company_name
                  ) > 0
              )

            const matchesIndustryFilter =
              !industryFilter ||
              result.workExperience.some(
                (experience) =>
                  getTextMatchStrength(
                    industryFilter,
                    experience.industry
                  ) > 0
              )

            const passesMatchFilter =
              result.matchPercentage >=
              minimumMatch

            const passesFilters =
              matchesMajorFilter &&
              matchesAcademicYearFilter &&
              matchesCareerFilter &&
              matchesClubFilter &&
              matchesInterestFilter &&
              matchesCompanyFilter &&
              matchesIndustryFilter &&
              passesMatchFilter

            // ==================================
            // RANKING STYLE
            // ==================================

            const matchStyle =
              normalize(
                matchPreferences?.match_style
              )

            let compatibilityWeight =
              0.6

            let explorationWeight =
              0

            if (
              matchStyle.includes(
                'compat'
              ) ||
              matchStyle.includes(
                'similar'
              ) ||
              matchStyle.includes(
                'focused'
              )
            ) {
              compatibilityWeight =
                1
            }

            if (
              matchStyle.includes(
                'random'
              ) ||
              matchStyle.includes(
                'explore'
              ) ||
              matchStyle.includes(
                'any'
              )
            ) {
              compatibilityWeight =
                0.2

              explorationWeight =
                1
            }

            // Deterministic exploration score.
            // This gives explore/any styles some variety
            // without making results jump on every render.
            const explorationSeed =
              `${normalizedQuery}:${profile.id}`

            let explorationHash =
              0

            for (
              let index = 0;
              index <
              explorationSeed.length;
              index++
            ) {
              explorationHash =
                (
                  explorationHash *
                    31 +
                  explorationSeed.charCodeAt(
                    index
                  )
                ) %
                1009
            }

            const explorationScore =
              (
                explorationHash /
                1009
              ) *
              explorationWeight

            // Search relevance is intentionally dominant.
            // Compatibility and exploration only reorder
            // people with similarly relevant search hits.
            const combinedScore =
              searchScore *
                100 +
              result.compatibilityScore *
                compatibilityWeight +
              explorationScore

            return {
              ...result,
              searchScore,
              searchReasons: [
                ...new Set(
                  searchReasons
                ),
              ],
              matchedWorkExperience:
                bestWorkExperience
                  ?.experience ||
                null,
              matchedProject:
                bestProject
                  ?.project ||
                null,
              combinedScore,
              passesFilters,
            }
          })
          .filter(
            (result) =>
              result.passesFilters &&
              (
                normalizedQuery
                  ? result.searchScore > 0
                  : true
              )
          )

      scored.sort(
        (a, b) => {
          if (
            sortBy ===
            'relevance'
          ) {
            if (
              b.searchScore !==
              a.searchScore
            ) {
              return (
                b.searchScore -
                a.searchScore
              )
            }
          }

          if (
            sortBy ===
            'compatibility'
          ) {
            if (
              b.compatibilityScore !==
              a.compatibilityScore
            ) {
              return (
                b.compatibilityScore -
                a.compatibilityScore
              )
            }

            if (
              b.searchScore !==
              a.searchScore
            ) {
              return (
                b.searchScore -
                a.searchScore
              )
            }
          }

          if (
            sortBy ===
            'best'
          ) {
            if (
              b.searchScore !==
              a.searchScore
            ) {
              return (
                b.searchScore -
                a.searchScore
              )
            }

            if (
              b.combinedScore !==
              a.combinedScore
            ) {
              return (
                b.combinedScore -
                a.combinedScore
              )
            }

            if (
              b.compatibilityScore !==
              a.compatibilityScore
            ) {
              return (
                b.compatibilityScore -
                a.compatibilityScore
              )
            }
          }

          const aName =
            normalize(
              `${
                a.profile.first_name ||
                ''
              } ${
                a.profile.last_name ||
                ''
              }`
            )

          const bName =
            normalize(
              `${
                b.profile.first_name ||
                ''
              } ${
                b.profile.last_name ||
                ''
              }`
            )

          return aName.localeCompare(
            bName
          )
        }
      )

      return scored
    }, [
      query,
      results,
      matchPreferences,
      activeFilterCount,
      majorFilter,
      academicYearFilter,
      careerFilter,
      clubFilter,
      interestFilter,
      companyFilter,
      industryFilter,
      minimumMatch,
      sortBy,
    ])

  // ============================================
  // RECORD SEARCH HISTORY
  // ============================================

  useEffect(() => {
    const cleaned =
      query.trim()

    if (!cleaned) {
      return
    }

    const timeout =
      window.setTimeout(
        () => {
          saveRecentSearch(
            cleaned
          )
        },
        700
      )

    return () =>
      window.clearTimeout(
        timeout
      )
  }, [query, userId])

  // ============================================
  // SEND CONNECTION REQUEST
  // ============================================

  async function sendConnectionRequest(
    profileId: string
  ) {
    if (
      !userId ||
      sendingId
    ) {
      return
    }

    setSendingId(
      profileId
    )

    setError('')

    const supabase =
      createClient()

    // ========================================
    // CHECK FOR BLOCK
    // ========================================

    const {
      data:
        blockedRelationship,
      error:
        blockedRelationshipError,
    } =
      await supabase
        .from(
          'blocked_users'
        )
        .select(`
          blocker_id,
          blocked_id
        `)
        .or(
          `and(blocker_id.eq.${userId},blocked_id.eq.${profileId}),and(blocker_id.eq.${profileId},blocked_id.eq.${userId})`
        )
        .maybeSingle()

    if (
      blockedRelationshipError
    ) {
      setError(
        `Could not check blocked users: ${blockedRelationshipError.message}`
      )

      setSendingId(null)
      return
    }

    if (
      blockedRelationship
    ) {
      setError(
        'You cannot connect with this student.'
      )

      setSendingId(null)
      return
    }

    // ========================================
    // CHECK EXISTING CONNECTION
    // ========================================

    const {
      data:
        existingConnection,
      error:
        existingConnectionError,
    } =
      await supabase
        .from(
          'connections'
        )
        .select(`
          id,
          sender_id,
          receiver_id,
          status
        `)
        .or(
          `and(sender_id.eq.${userId},receiver_id.eq.${profileId}),and(sender_id.eq.${profileId},receiver_id.eq.${userId})`
        )
        .maybeSingle()

    if (
      existingConnectionError
    ) {
      setError(
        `Could not check connection: ${existingConnectionError.message}`
      )

      setSendingId(null)
      return
    }

    if (
      existingConnection
    ) {
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

      setSendingId(null)
      return
    }

    // ========================================
    // CREATE REQUEST
    // ========================================

    const {
      error: insertError,
    } =
      await supabase
        .from(
          'connections'
        )
        .insert({
          sender_id:
            userId,
          receiver_id:
            profileId,
          status:
            'pending',
        })

    if (insertError) {
      setError(
        `Could not send connection request: ${insertError.message}`
      )

      setSendingId(null)
      return
    }

    setSentIds(
      (current) => {
        const next =
          new Set(
            current
          )

        next.add(
          profileId
        )

        return next
      }
    )

    setSendingId(null)
  }

  // ============================================
  // LOADING
  // ============================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">

        <div className="text-center">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
            🔎
          </div>

          <p className="mt-4 text-sm font-medium text-gray-500">
            Preparing Brework search...
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
              router.push('/profile')
            }
            className="rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-black"
          >
            Profile
          </button>

        </div>

      </header>

      {/* MAIN */}

      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-12">

        {/* TITLE */}

        <section className="mb-8">

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
            Find people
          </p>

          <h1 className="mt-2 break-words text-3xl font-bold tracking-tight sm:text-5xl">
            Search Brework
          </h1>

          <p className="mt-3 max-w-2xl text-base leading-relaxed text-gray-500">
            Search students by name, major,
            career goal, interests, clubs,
            companies, roles, industries, projects,
            academic year, or keywords in their profile.
          </p>

        </section>

        {/* ERROR */}

        {error && (
          <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* SEARCH BAR */}

        <section>

          <div className="rounded-3xl border border-gray-200/70 bg-white p-4 shadow-sm sm:p-5">

            <div className="flex items-center gap-2 sm:gap-3">

              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg">
                🔎
              </div>

              <input
                type="text"
                value={query}
                onChange={(event) =>
                  setQuery(
                    event.target.value
                  )
                }
                placeholder="Search people, majors, clubs, companies, projects..."
                className="min-w-0 flex-1 bg-transparent text-base font-medium text-gray-900 outline-none placeholder:text-gray-400"
              />

              {query && (
                <button
                  type="button"
                  onClick={() =>
                    setQuery('')
                  }
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-black"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}

            </div>

          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">

            <button
              type="button"
              onClick={() =>
                setShowFilters(
                  (current) =>
                    !current
                )
              }
              className={`w-full rounded-xl border px-4 py-2 text-sm font-semibold transition sm:w-auto ${
                showFilters ||
                activeFilterCount > 0
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-black'
              }`}
            >
              Filters
              {activeFilterCount > 0
                ? ` (${activeFilterCount})`
                : ''}
            </button>

            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(
                  event.target.value as
                    | 'best'
                    | 'relevance'
                    | 'compatibility'
                )
              }
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 outline-none transition hover:border-gray-300 focus:border-gray-400 sm:w-auto"
            >
              <option value="best">
                Sort: Best match
              </option>
              <option value="relevance">
                Sort: Most relevant
              </option>
              <option value="compatibility">
                Sort: Most compatible
              </option>
            </select>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-400 transition hover:bg-gray-100 hover:text-black"
              >
                Clear filters
              </button>
            )}

          </div>

          {showFilters && (

            <div className="mt-3 rounded-3xl border border-gray-200/70 bg-white p-5 shadow-sm">

              <div className="flex items-start justify-between gap-4">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Filters
                  </p>

                  <h2 className="mt-1 text-lg font-bold">
                    Narrow your results
                  </h2>

                  <p className="mt-1 text-xs text-gray-400">
                    Searchable filters accept custom values, even if they are not in the suggestions.
                  </p>

                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowFilters(
                      false
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-black"
                  aria-label="Close filters"
                >
                  ×
                </button>

              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">

                <div>

                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                    Major
                  </label>

                  <input
                    type="text"
                    list="major-filter-options"
                    value={majorFilter}
                    onChange={(event) =>
                      setMajorFilter(
                        event.target.value
                      )
                    }
                    placeholder="e.g. Cognitive Science"
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-gray-400"
                  />

                  <datalist id="major-filter-options">
                    {filterOptions.majors.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        />
                      )
                    )}
                  </datalist>

                  <p className="mt-1.5 text-[11px] text-gray-400">
                    Type anything or choose a suggestion.
                  </p>

                </div>

                <div>

                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                    Academic year
                  </label>

                  <select
                    value={academicYearFilter}
                    onChange={(event) =>
                      setAcademicYearFilter(
                        event.target.value
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-400"
                  >
                    <option value="">
                      Any year
                    </option>

                    {filterOptions.academicYears.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      )
                    )}

                  </select>

                </div>

                <div>

                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                    Career interest
                  </label>

                  <input
                    type="text"
                    list="career-filter-options"
                    value={careerFilter}
                    onChange={(event) =>
                      setCareerFilter(
                        event.target.value
                      )
                    }
                    placeholder="e.g. Product Management"
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-gray-400"
                  />

                  <datalist id="career-filter-options">
                    {filterOptions.careers.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        />
                      )
                    )}
                  </datalist>

                  <p className="mt-1.5 text-[11px] text-gray-400">
                    Type anything or choose a suggestion.
                  </p>

                </div>

                <div>

                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                    Club
                  </label>

                  <input
                    type="text"
                    list="club-filter-options"
                    value={clubFilter}
                    onChange={(event) =>
                      setClubFilter(
                        event.target.value
                      )
                    }
                    placeholder="e.g. Product Space"
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-gray-400"
                  />

                  <datalist id="club-filter-options">
                    {filterOptions.clubs.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        />
                      )
                    )}
                  </datalist>

                  <p className="mt-1.5 text-[11px] text-gray-400">
                    Type anything or choose a suggestion.
                  </p>

                </div>

                <div>

                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                    Interest
                  </label>

                  <input
                    type="text"
                    list="interest-filter-options"
                    value={interestFilter}
                    onChange={(event) =>
                      setInterestFilter(
                        event.target.value
                      )
                    }
                    placeholder="e.g. Artificial Intelligence"
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-gray-400"
                  />

                  <datalist id="interest-filter-options">
                    {filterOptions.interests.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        />
                      )
                    )}
                  </datalist>

                  <p className="mt-1.5 text-[11px] text-gray-400">
                    Type anything or choose a suggestion.
                  </p>

                </div>

                <div>

                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                    Company
                  </label>

                  <input
                    type="text"
                    list="company-filter-options"
                    value={companyFilter}
                    onChange={(event) =>
                      setCompanyFilter(
                        event.target.value
                      )
                    }
                    placeholder="e.g. Microsoft"
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-gray-400"
                  />

                  <datalist id="company-filter-options">
                    {filterOptions.companies.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        />
                      )
                    )}
                  </datalist>

                  <p className="mt-1.5 text-[11px] text-gray-400">
                    Type anything or choose a suggestion.
                  </p>

                </div>

                <div>

                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                    Industry
                  </label>

                  <input
                    type="text"
                    list="industry-filter-options"
                    value={industryFilter}
                    onChange={(event) =>
                      setIndustryFilter(
                        event.target.value
                      )
                    }
                    placeholder="e.g. Technology"
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-gray-400"
                  />

                  <datalist id="industry-filter-options">
                    {filterOptions.industries.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        />
                      )
                    )}
                  </datalist>

                  <p className="mt-1.5 text-[11px] text-gray-400">
                    Type anything or choose a suggestion.
                  </p>

                </div>

                <div>

                  <div className="flex items-center justify-between">

                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                      Minimum match
                    </label>

                    <span className="text-xs font-semibold text-gray-500">
                      {minimumMatch}%
                    </span>

                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={minimumMatch}
                    onChange={(event) =>
                      setMinimumMatch(
                        Number(
                          event.target.value
                        )
                      )
                    }
                    className="mt-4 w-full"
                  />

                  <div className="mt-1 flex justify-between text-[10px] text-gray-400">

                    <span>
                      Any
                    </span>

                    <span>
                      100%
                    </span>

                  </div>

                </div>

              </div>

            </div>

          )}

        </section>

        {/* RECENT SEARCHES + SEARCH EXAMPLES */}

        {!query &&
          activeFilterCount === 0 && (

          <section className="mt-8">

            {recentSearches.length > 0 && (

              <div className="mb-8">

                <div className="flex items-center justify-between gap-4">

                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Recent searches
                  </p>

                  <button
                    type="button"
                    onClick={clearRecentSearches}
                    className="text-xs font-semibold text-gray-400 transition hover:text-black"
                  >
                    Clear all
                  </button>

                </div>

                <div className="mt-4 flex flex-wrap gap-2">

                  {recentSearches.map(
                    (item) => (

                    <div
                      key={item}
                      className="flex items-center overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm"
                    >

                      <button
                        type="button"
                        onClick={() =>
                          setQuery(
                            item
                          )
                        }
                        className="max-w-[70vw] truncate px-4 py-2 text-sm font-medium text-gray-600 transition hover:text-black sm:max-w-none"
                      >
                        {item}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          removeRecentSearch(
                            item
                          )
                        }
                        className="flex h-full items-center justify-center border-l border-gray-100 px-3 text-sm text-gray-300 transition hover:bg-gray-50 hover:text-black"
                        aria-label={`Remove ${item} from recent searches`}
                      >
                        ×
                      </button>

                    </div>

                  ))}

                </div>

              </div>

            )}

            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              Try searching
            </p>

            <div className="mt-4 flex flex-wrap gap-2">

              {[
                'Cognitive Science',
                'Product Management',
                'Consulting',
                'Artificial Intelligence',
                'Finance Club',
                'Product Space',
                'Microsoft',
                'AI Study Assistant',
              ].map(
                (item) => (

                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      setQuery(
                        item
                      )
                    }
                    className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-gray-300 hover:text-black"
                  >
                    {item}
                  </button>

                )
              )}

            </div>

            {/* SEARCH INFO */}

            <div className="mt-8 rounded-3xl border border-gray-200/70 bg-white p-6 shadow-sm">

              <div className="flex items-start gap-3 sm:gap-4">

                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100">
                  ✨
                </div>

                <div>

                  <h2 className="font-semibold">
                    Smarter people search
                  </h2>

                  <p className="mt-1 text-sm leading-relaxed text-gray-500">
                    Brework finds students who match what
                    you searched for, then uses your shared
                    interests, clubs, work experience, projects, and
                    profile compatibility to help rank the strongest results first.
                  </p>

                </div>

              </div>

            </div>

          </section>

        )}

        {/* RESULTS */}

        {(query ||
          activeFilterCount > 0) && (

          <section className="mt-8">

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

              <div>

                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Results
                </p>

                <h2 className="mt-1 break-words text-2xl font-bold">
                  {query
                    ? `“${query}”`
                    : 'Filtered people'}
                </h2>

              </div>

              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 shadow-sm">
                {filteredResults.length}{' '}
                {filteredResults.length ===
                1
                  ? 'person'
                  : 'people'}
              </span>

            </div>

            {/* NO RESULTS */}

            {filteredResults.length ===
            0 ? (

              <div className="mt-5 rounded-3xl border border-gray-200/70 bg-white p-8 text-center shadow-sm">

                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl">
                  🔎
                </div>

                <h3 className="mt-4 text-lg font-semibold">
                  No people found
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500">
                  {activeFilterCount > 0
                    ? 'Try clearing one or more filters, lowering the minimum match percentage, or using a broader search.'
                    : 'Try searching another name, major, career interest, club, company, role, industry, project, academic year, or interest.'}
                </p>

              </div>

            ) : (

              <div className="mt-5 space-y-4">

                {filteredResults.map(
                  (result) => {

                    const profile =
                      result.profile

                    const fullName =
                      `${
                        profile.first_name ||
                        ''
                      } ${
                        profile.last_name ||
                        ''
                      }`.trim() ||
                      'Student'

                    const initials =
                      `${
                        profile.first_name?.charAt(
                          0
                        ) || ''
                      }${
                        profile.last_name?.charAt(
                          0
                        ) || ''
                      }`
                        .toUpperCase() ||
                      '?'

                    const requestSent =
                      sentIds.has(
                        profile.id
                      )

                    const connectionStatus =
                      connectionStatuses[
                        profile.id
                      ]

                    const isSending =
                      sendingId ===
                      profile.id

                    return (
                      <div
                        key={
                          profile.id
                        }
                        onClick={() =>
                          setSelectedResult(
                            result
                          )
                        }
                        className="cursor-pointer rounded-3xl border border-gray-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6"
                      >

                        <div className="flex items-start gap-4">

                          {/* PHOTO */}

                          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 sm:h-16 sm:w-16">

                            {profile.profile_photo_url ? (

                              <img
                                src={
                                  profile.profile_photo_url
                                }
                                alt={`${fullName} profile`}
                                className="h-full w-full object-cover"
                              />

                            ) : (

                              <span className="text-lg font-bold text-gray-500">
                                {initials}
                              </span>

                            )}

                          </div>

                          {/* SUMMARY */}

                          <div className="min-w-0 flex-1">

                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">

                              <div className="min-w-0">

                                <h3 className="break-words text-base font-bold sm:text-lg">
                                  {fullName}
                                </h3>

                                {profile.show_academic_info && (

                                  <p className="mt-1 break-words text-sm text-gray-500">

                                    {profile.major ||
                                      'Major not listed'}

                                    {profile.academic_year
                                      ? ` • ${profile.academic_year}`
                                      : ''}

                                  </p>

                                )}

                                {profile.show_career_goal &&
                                  profile.career_goal && (

                                  <p className="mt-1 break-words text-sm font-medium text-gray-700">
                                    {
                                      profile.career_goal
                                    }
                                  </p>

                                )}

                              </div>

                              <div className="w-fit shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                                ✨{' '}
                                {
                                  result.matchPercentage
                                }
                                % Match
                              </div>

                            </div>

                            {/* TOP MATCH REASONS */}

                            {result.searchReasons.length >
                              0 && (

                              <div className="mt-3 flex flex-wrap gap-2">

                                {result.searchReasons
                                  .slice(
                                    0,
                                    2
                                  )
                                  .map(
                                    (
                                      reason
                                    ) => (

                                    <span
                                      key={
                                        reason
                                      }
                                      className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600"
                                    >
                                      {reason}
                                    </span>

                                  )
                                )}

                              </div>

                            )}

                          </div>

                        </div>

                        {/* ACTIONS */}

                        <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">

                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()

                              if (
                                connectionStatus ===
                                  'accepted' ||
                                connectionStatus ===
                                  'pending'
                              ) {
                                return
                              }

                              sendConnectionRequest(
                                profile.id
                              )
                            }}
                            disabled={
                              isSending ||
                              requestSent ||
                              connectionStatus ===
                                'accepted' ||
                              connectionStatus ===
                                'pending'
                            }
                            className={`w-full flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:w-auto ${
                              connectionStatus ===
                                'accepted' ||
                              connectionStatus ===
                                'pending' ||
                              requestSent
                                ? 'cursor-default bg-gray-100 text-gray-500'
                                : 'bg-black text-white hover:bg-gray-800'
                            } disabled:opacity-70`}
                          >

                            {isSending
                              ? 'Sending...'
                              : connectionStatus ===
                                  'accepted'
                                ? 'Already connected ✓'
                                : connectionStatus ===
                                    'pending'
                                  ? 'Request pending'
                                  : requestSent
                                    ? 'Request sent ✓'
                                    : 'Connect'}

                          </button>

                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()

                              setSelectedResult(
                                result
                              )
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-black sm:w-auto"
                          >
                            View profile
                          </button>

                        </div>

                      </div>
                    )
                  }
                )}

              </div>

            )}

          </section>

        )}

      </div>

      {/* PROFILE PREVIEW MODAL */}

      {selectedResult && (() => {

        const profile =
          selectedResult.profile

        const fullName =
          `${
            profile.first_name || ''
          } ${
            profile.last_name || ''
          }`.trim() ||
          'Student'

        const initials =
          `${
            profile.first_name?.charAt(
              0
            ) || ''
          }${
            profile.last_name?.charAt(
              0
            ) || ''
          }`
            .toUpperCase() ||
          '?'

        const requestSent =
          sentIds.has(
            profile.id
          )

        const connectionStatus =
          connectionStatuses[
            profile.id
          ]

        const isSending =
          sendingId ===
          profile.id

        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={() =>
              setSelectedResult(
                null
              )
            }
          >

            <div
              className="h-[94vh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-[2rem] bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-[2rem] sm:pb-0"
              onClick={(event) =>
                event.stopPropagation()
              }
            >

              {/* MODAL HEADER */}

              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Profile preview
                  </p>

                  <p className="mt-0.5 text-sm font-semibold text-gray-700">
                    Brework
                  </p>

                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedResult(
                      null
                    )
                  }
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-500 transition hover:bg-gray-200 hover:text-black"
                  aria-label="Close profile preview"
                >
                  ×
                </button>

              </div>

              <div className="p-4 sm:p-7">

                {/* PROFILE HEADER */}

                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">

                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 sm:h-24 sm:w-24">

                    {profile.profile_photo_url ? (

                      <ExpandableProfilePhoto
                        src={profile.profile_photo_url}
                        name={fullName}
                      />

                    ) : (

                      <span className="text-2xl font-bold text-gray-500">
                        {initials}
                      </span>

                    )}

                  </div>

                  <div className="min-w-0 flex-1">

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

                      <div>

                        <h2 className="break-words text-2xl font-bold tracking-tight">
                          {fullName}
                        </h2>

                        {profile.show_academic_info && (

                          <p className="mt-1 break-words text-sm text-gray-500">

                            {profile.major ||
                              'Major not listed'}

                            {profile.academic_year
                              ? ` • ${profile.academic_year}`
                              : ''}

                          </p>

                        )}

                      </div>

                      <div className="w-fit rounded-full bg-black px-3 py-1.5 text-xs font-bold text-white">
                        ✨{' '}
                        {
                          selectedResult.matchPercentage
                        }
                        % Match
                      </div>

                    </div>

                  </div>

                </div>

                {/* ABOUT */}

                {profile.bio && (

                  <div className="mt-6">

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      About
                    </p>

                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                      {profile.bio}
                    </p>

                  </div>

                )}

                {/* CAREER */}

                {profile.show_career_goal &&
                  profile.career_goal && (

                  <div className="mt-6">

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Career interest
                    </p>

                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {
                        profile.career_goal
                      }
                    </p>

                  </div>

                )}

                {/* PROFILE DETAILS FALLBACK */}

                {!profile.bio &&
                  !(
                    profile.show_career_goal &&
                    profile.career_goal
                  ) &&
                  selectedResult.interests.length === 0 &&
                  selectedResult.clubs.length === 0 &&
                  selectedResult.workExperience.length === 0 &&
                  selectedResult.projects.length === 0 && (

                  <div className="mt-6 rounded-2xl bg-gray-50 p-4">

                    <p className="text-sm font-semibold text-gray-700">
                      This profile is still being completed.
                    </p>

                    <p className="mt-1 text-sm leading-relaxed text-gray-500">
                      You can still connect now and learn more through a conversation.
                    </p>

                  </div>

                )}

                {/* WHY MATCH */}

                {selectedResult.compatibilityReasons.length >
                  0 && (

                  <div className="mt-6 rounded-2xl bg-gray-50 p-4">

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Why you match
                    </p>

                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                      {selectedResult.compatibilityReasons.join(
                        ' • '
                      )}
                    </p>

                  </div>

                )}

                {/* SHARED INTERESTS */}

                {selectedResult.sharedInterests.length >
                  0 && (

                  <div className="mt-6">

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Shared interests
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">

                      {selectedResult.sharedInterests.map(
                        (
                          interest
                        ) => (

                        <span
                          key={
                            interest.id
                          }
                          className="max-w-full break-words rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          {
                            interest.name
                          } ✓
                        </span>

                      ))}

                    </div>

                  </div>

                )}

                {/* ALL INTERESTS */}

                {selectedResult.interests.length >
                  0 && (

                  <div className="mt-6">

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Interests
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">

                      {selectedResult.interests.map(
                        (
                          interest
                        ) => {

                          const shared =
                            selectedResult.sharedInterests.some(
                              (
                                sharedInterest
                              ) =>
                                sharedInterest.id ===
                                interest.id
                            )

                          return (
                            <span
                              key={
                                interest.id
                              }
                              className={`max-w-full break-words rounded-full px-3 py-1.5 text-xs font-medium ${
                                shared
                                  ? 'bg-gray-900 text-white'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {
                                interest.name
                              }

                              {shared &&
                                ' ✓'}
                            </span>
                          )
                        }
                      )}

                    </div>

                  </div>

                )}

                {/* SHARED CLUBS */}

                {selectedResult.sharedClubs.length >
                  0 && (

                  <div className="mt-6">

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Shared clubs
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">

                      {selectedResult.sharedClubs.map(
                        (
                          club
                        ) => (

                        <span
                          key={
                            club.id
                          }
                          className="max-w-full break-words rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          {
                            club.name
                          } ✓
                        </span>

                      ))}

                    </div>

                  </div>

                )}

                {/* ALL CLUBS */}

                {selectedResult.clubs.length >
                  0 && (

                  <div className="mt-6">

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Clubs
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">

                      {selectedResult.clubs.map(
                        (
                          club
                        ) => {

                          const shared =
                            selectedResult.sharedClubs.some(
                              (
                                sharedClub
                              ) =>
                                sharedClub.id ===
                                club.id
                            )

                          return (
                            <span
                              key={
                                club.id
                              }
                              className={`max-w-full break-words rounded-full px-3 py-1.5 text-xs font-medium ${
                                shared
                                  ? 'bg-black text-white'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {
                                club.name
                              }

                              {shared &&
                                ' ✓'}
                            </span>
                          )
                        }
                      )}

                    </div>

                  </div>

                )}

                {/* WORK EXPERIENCE */}

                {selectedResult.workExperience.length >
                  0 && (

                  <div className="mt-6">

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Work experience
                    </p>

                    <div className="mt-3 space-y-3">

                      {selectedResult.workExperience.map(
                        (
                          experience
                        ) => (

                        <div
                          key={
                            experience.id
                          }
                          className="rounded-2xl bg-gray-50 p-4"
                        >

                          <div className="flex flex-wrap items-start justify-between gap-2">

                            <div>

                              <p className="break-words text-sm font-bold text-gray-900">
                                {
                                  experience.company_name
                                }
                              </p>

                              {experience.role_title && (

                                <p className="mt-1 break-words text-sm font-medium text-gray-700">
                                  {
                                    experience.role_title
                                  }
                                </p>

                              )}

                            </div>

                            {experience.is_current && (

                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                                Current
                              </span>

                            )}

                          </div>

                          {experience.industry && (

                            <p className="mt-2 text-xs text-gray-400">
                              {
                                experience.industry
                              }
                            </p>

                          )}

                          {experience.description && (

                            <p className="mt-2 break-words text-sm leading-relaxed text-gray-500">
                              {
                                experience.description
                              }
                            </p>

                          )}

                        </div>

                      ))}

                    </div>

                  </div>

                )}

                {/* PROJECTS */}

                {selectedResult.projects.length >
                  0 && (

                  <div className="mt-6">

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Projects
                    </p>

                    <div className="mt-3 space-y-3">

                      {selectedResult.projects.map(
                        (
                          project
                        ) => (

                        <div
                          key={
                            project.id
                          }
                          className="rounded-2xl bg-gray-50 p-4"
                        >

                          <p className="break-words text-sm font-bold text-gray-900">
                            {
                              project.title
                            }
                          </p>

                          {project.description && (

                            <p className="mt-2 break-words text-sm leading-relaxed text-gray-500">
                              {
                                project.description
                              }
                            </p>

                          )}

                        </div>

                      ))}

                    </div>

                  </div>

                )}

                {/* SEARCH REASONS */}

                {selectedResult.searchReasons.length >
                  0 && (

                  <div className="mt-6">

                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      Matches your search
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">

                      {selectedResult.searchReasons.map(
                        (
                          reason
                        ) => (

                        <span
                          key={
                            reason
                          }
                          className="max-w-full break-words rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600"
                        >
                          {reason}
                        </span>

                      ))}

                    </div>

                  </div>

                )}

                {/* CONNECT */}

                <div className="mt-7 border-t border-gray-100 pt-5">

                  <button
                    type="button"
                    onClick={() => {
                      if (
                        connectionStatus ===
                          'accepted' ||
                        connectionStatus ===
                          'pending'
                      ) {
                        return
                      }

                      sendConnectionRequest(
                        profile.id
                      )
                    }}
                    disabled={
                      isSending ||
                      requestSent ||
                      connectionStatus ===
                        'accepted' ||
                      connectionStatus ===
                        'pending'
                    }
                    className={`w-full rounded-xl px-5 py-3.5 text-sm font-semibold transition ${
                      connectionStatus ===
                        'accepted' ||
                      connectionStatus ===
                        'pending' ||
                      requestSent
                        ? 'cursor-default bg-gray-100 text-gray-500'
                        : 'bg-black text-white hover:bg-gray-800'
                    } disabled:opacity-70`}
                  >

                    {isSending
                      ? 'Sending...'
                      : connectionStatus ===
                          'accepted'
                        ? 'Already connected ✓'
                        : connectionStatus ===
                            'pending'
                          ? 'Request pending'
                          : requestSent
                            ? 'Request sent ✓'
                            : `Connect with ${profile.first_name || 'student'}`}

                  </button>

                </div>

              </div>

            </div>

          </div>
        )
      })()}

      <BottomNav />

    </main>
  )
}