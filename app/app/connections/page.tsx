'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { openExternalUrl } from '@/lib/native/openExternalUrl'
import { useRouter } from 'next/navigation'
import BottomNav from '../components/BottomNav'

type Connection = {
  id: number
  sender_id: string
  receiver_id: string
  status: string
  created_at: string
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
}

type DetailedProfile = Profile & {
  contact_email: string | null
  resume_url: string | null
  contact_visibility: string | null
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
  role_title: string
  industry: string
  description: string | null
  start_date: string
  end_date: string | null
  is_current: boolean
}

type Project = {
  id: number
  user_id: string
  title: string
  description: string | null
}

type ProfileLink = {
  id?: number
  label: string
  url: string
  sort_order: number
}

type ProfileDetails = {
  profile: DetailedProfile
  interests: Interest[]
  clubs: Club[]
  workExperiences: WorkExperience[]
  projects: Project[]
  links: ProfileLink[]
  canViewContact: boolean
}

type Match = {
  id: number
  user_1_id: string
  user_2_id: string
  status: string | null
}

type ConnectionWithProfile = Connection & {
  person: Profile | null
}

export default function ConnectionsPage() {
  const router = useRouter()

  const [connections, setConnections] = useState<
    ConnectionWithProfile[]
  >([])

  const [pendingRequests, setPendingRequests] = useState<
    ConnectionWithProfile[]
  >([])

  const [matches, setMatches] = useState<Match[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [error, setError] = useState('')

  const [openMenuId, setOpenMenuId] =
    useState<number | null>(null)

  const [
    selectedProfile,
    setSelectedProfile,
  ] = useState<Profile | null>(null)

  const [
    selectedProfileDetails,
    setSelectedProfileDetails,
  ] = useState<ProfileDetails | null>(null)

  const [
    profileDetailsLoading,
    setProfileDetailsLoading,
  ] = useState(false)

  const [
    profileDetailsError,
    setProfileDetailsError,
  ] = useState('')

  const [
    relationshipAction,
    setRelationshipAction,
  ] = useState<{
    type: 'remove' | 'block'
    connectionId: number
    person: Profile
  } | null>(null)

  const [
    relationshipLoading,
    setRelationshipLoading,
  ] = useState(false)

  const [reportAction, setReportAction] =
    useState<{
      person: Profile
    } | null>(null)

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

  useEffect(() => {
    if (openMenuId === null) return

    function dismissOutside(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element) ||
          !target.closest(`[data-connection-menu="${openMenuId}"]`)) {
        setOpenMenuId(null)
      }
    }

    function dismissWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMenuId(null)
    }

    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('keydown', dismissWithEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('keydown', dismissWithEscape)
    }
  }, [openMenuId])

  const searchWords = searchQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  function matchesSearch(connection: ConnectionWithProfile) {
    const person = connection.person
    const searchable = [getName(person), person?.major, person?.academic_year]
      .filter(Boolean).join(' ').toLocaleLowerCase()
    return searchWords.every(word => searchable.includes(word))
  }
  const filteredConnections = connections.filter(matchesSearch)
  const filteredRequests = pendingRequests.filter(matchesSearch)

  async function loadConnections() {
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

    const [connectionResult, matchResult] = await Promise.all([
      supabase
      .from('connections')
      .select(
        'id, sender_id, receiver_id, status, created_at'
      )
      .or(
        `sender_id.eq.${user.id},receiver_id.eq.${user.id}`
      )
      .order('created_at', {
        ascending: false,
      }),
      supabase
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
      .eq('status', 'active'),
    ])
    const { data: connectionData, error: connectionsError } = connectionResult
    const { data: matchData, error: matchesError } = matchResult

    if (connectionsError) {
      setError(
        `Could not load connections: ${connectionsError.message}`
      )
      setLoading(false)
      return
    }

    const accepted = (connectionData || []).filter(
      (connection) => connection.status === 'accepted'
    )

    const pending = (connectionData || []).filter(
      (connection) =>
        connection.status === 'pending' &&
        connection.receiver_id === user.id
    )

    const otherUserIds = [...accepted, ...pending].map(
      (connection) =>
        connection.sender_id === user.id
          ? connection.receiver_id
          : connection.sender_id
    )

    const uniqueUserIds = [...new Set(otherUserIds)]

    let profileData: Profile[] = []

    if (uniqueUserIds.length > 0) {
      const {
        data,
        error: profilesError,
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
        .in('id', uniqueUserIds)

      if (profilesError) {
        setError(
          `Could not load profiles: ${profilesError.message}`
        )
        setLoading(false)
        return
      }

      profileData = data || []
    }

    const profilesById = new Map(profileData.map(profile => [profile.id, profile]))

    const acceptedWithProfiles: ConnectionWithProfile[] =
      accepted.map((connection) => {
        const otherUserId =
          connection.sender_id === user.id
            ? connection.receiver_id
            : connection.sender_id

        return {
          ...connection,
          person:
            profilesById.get(otherUserId) || null,
        }
      })

    const pendingWithProfiles: ConnectionWithProfile[] =
      pending.map((connection) => ({
        ...connection,
        person:
          profilesById.get(connection.sender_id) || null,
      }))

    // ============================================
    // LOAD ACTIVE MATCHES FOR MESSAGING
    // ============================================

    if (matchesError) {
      setError(
        `Could not load matches: ${matchesError.message}`
      )
      setLoading(false)
      return
    }

    setMatches((matchData || []) as Match[])

    setConnections(acceptedWithProfiles)
    setPendingRequests(pendingWithProfiles)
    setLoading(false)
  }

  useEffect(() => {
    loadConnections()
  }, [])

  async function handleRequestAction(
    connectionId: number,
    newStatus: 'accepted' | 'declined'
  ) {
    if (actionLoading !== null) return

    setActionLoading(connectionId)
    setError('')

    const supabase = createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setActionLoading(null)
      router.push('/login')
      return
    }

    const {
      data: connection,
      error: connectionFetchError,
    } = await supabase
      .from('connections')
      .select(
        'id, sender_id, receiver_id, status'
      )
      .eq('id', connectionId)
      .eq('receiver_id', user.id)
      .eq('status', 'pending')
      .single()

    if (connectionFetchError || !connection) {
      setError(
        connectionFetchError?.message ||
          'This request is no longer pending.'
      )
      setActionLoading(null)
      return
    }

    // ============================================
    // DECLINE REQUEST
    // ============================================

    if (newStatus === 'declined') {
      const {
        error: declineError,
      } = await supabase
        .from('connections')
        .update({
          status: 'declined',
        })
        .eq('id', connectionId)
        .eq('receiver_id', user.id)
        .eq('status', 'pending')

      if (declineError) {
        setError(
          `Could not decline request: ${declineError.message}`
        )

        setActionLoading(null)
        return
      }
    }

    // ============================================
    // ACCEPT REQUEST
    // ============================================

    if (newStatus === 'accepted') {
      const {
        error: acceptError,
      } = await supabase.rpc(
        'accept_connection_request',
        {
          p_connection_id:
            connectionId,
        }
      )

      if (acceptError) {
        console.error(
          'Could not accept connection request:',
          acceptError
        )

        setError(
          `Could not accept request: ${acceptError.message}`
        )

        setActionLoading(null)
        return
      }
    }

    setActionLoading(null)
    await loadConnections()

    // Tell BottomNav that the pending
    // connection count has changed.
    window.dispatchEvent(
      new CustomEvent(
        'brewlink:connection-change'
      )
    )
  }

  // ============================================
  // REMOVE / BLOCK CONNECTION
  // ============================================

  async function handleRelationshipAction() {
    if (
      !relationshipAction ||
      relationshipLoading
    ) {
      return
    }

    setRelationshipLoading(true)
    setError('')

    const supabase = createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setRelationshipLoading(false)
      router.push('/login')
      return
    }

    const {
      type,
      connectionId,
      person,
    } = relationshipAction

    const matchId =
      getMatchId(person.id)

    // ============================================
    // BLOCK USER FIRST
    // ============================================

    if (type === 'block') {
      const {
        error: blockError,
      } = await supabase
        .from('blocked_users')
        .upsert(
          {
            blocker_id: user.id,
            blocked_id: person.id,
          },
          {
            onConflict:
              'blocker_id,blocked_id',
          }
        )

      if (blockError) {
        setError(
          `Could not block this user: ${blockError.message}`
        )

        setRelationshipLoading(false)
        return
      }
    }

    // ============================================
    // CANCEL ACTIVE MATCH
    // ============================================

    if (matchId) {
      const {
        error: matchUpdateError,
      } = await supabase
        .from('matches')
        .update({
          status: 'cancelled',
        })
        .eq('id', matchId)

      if (matchUpdateError) {
        setError(
          `${
            type === 'block'
              ? 'User was blocked, but'
              : 'Could not remove connection because'
          } the active match could not be closed: ${matchUpdateError.message}`
        )

        setRelationshipLoading(false)
        return
      }
    }

    // ============================================
    // DELETE CONNECTION
    // ============================================

    const {
      error: deleteError,
    } = await supabase
      .from('connections')
      .delete()
      .eq('id', connectionId)

    if (deleteError) {
      setError(
        `${
          type === 'block'
            ? 'User was blocked, but the connection could not be removed'
            : 'Could not remove connection'
        }: ${deleteError.message}`
      )

      setRelationshipLoading(false)
      return
    }

    setRelationshipAction(null)
    setOpenMenuId(null)
    setRelationshipLoading(false)

    await loadConnections()

    window.dispatchEvent(
      new CustomEvent(
        'brewlink:connection-change'
      )
    )
  }

  // ============================================
  // REPORT USER
  // ============================================

  function openReportModal(person: Profile) {
    setOpenMenuId(null)
    setReportAction({ person })
    setReportReason('')
    setReportDetails('')
    setReportError('')
    setReportSubmitted(false)
  }

  function closeReportModal() {
    if (reportLoading) {
      return
    }

    setReportAction(null)
    setReportReason('')
    setReportDetails('')
    setReportError('')
    setReportSubmitted(false)
  }

  async function handleReportUser() {
    if (
      !reportAction ||
      !reportReason ||
      reportLoading
    ) {
      return
    }

    setReportLoading(true)
    setReportError('')

    const supabase = createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setReportLoading(false)
      router.push('/login')
      return
    }

    const { error: submitError } =
      await supabase.from('reports').insert({
        reporter_id: user.id,
        reported_user_id:
          reportAction.person.id,
        report_type: 'profile',
        reason: reportReason,
        details:
          reportDetails.trim() || null,
        reported_content: getName(
          reportAction.person
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

  function getName(person: Profile | null) {
    if (!person) return 'Student'

    const name =
      `${person.first_name || ''} ${
        person.last_name || ''
      }`.trim()

    return name || 'Student'
  }

  function getInitials(person: Profile | null) {
    if (!person) return '?'

    const first =
      person.first_name?.charAt(0) || ''

    const last =
      person.last_name?.charAt(0) || ''

    return `${first}${last}`.toUpperCase() || '?'
  }

  // ============================================
  // GET MATCH ID FOR CONNECTION
  // ============================================

  function getMatchId(personId: string) {
    const match = matches.find(
      (match) =>
        match.user_1_id === personId ||
        match.user_2_id === personId
    )

    return match?.id || null
  }

  // ============================================
  // PROFILE DETAILS
  // ============================================

  async function openProfile(
    person: Profile,
    isAcceptedConnection: boolean
  ) {
    setSelectedProfile(person)
    setSelectedProfileDetails(null)
    setProfileDetailsError('')
    setProfileDetailsLoading(true)

    const supabase = createClient()

    const {
      data: profileData,
      error: profileError,
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
        profile_photo_url,
        contact_email,
        resume_url,
        contact_visibility
      `)
      .eq('id', person.id)
      .single()

    if (profileError || !profileData) {
      setProfileDetailsError(
        `Could not load profile details: ${
          profileError?.message ||
          'Profile not found.'
        }`
      )
      setProfileDetailsLoading(false)
      return
    }

    const detailedProfile =
      profileData as DetailedProfile

    const canViewContact =
      detailedProfile.contact_visibility ===
        'everyone' ||
      (
        isAcceptedConnection &&
        detailedProfile.contact_visibility ===
          'connections'
      )

    const [
      userInterestResult,
      userClubResult,
      workResult,
      projectResult,
      linkResult,
    ] = await Promise.all([
      supabase
        .from('user_interests')
        .select('interest_id')
        .eq('user_id', person.id),

      supabase
        .from('user_clubs')
        .select('club_id')
        .eq('user_id', person.id),

      supabase
        .from('work_experience')
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
        .eq('user_id', person.id)
        .order('start_date', {
          ascending: false,
        }),

      supabase
        .from('projects')
        .select(`
          id,
          user_id,
          title,
          description
        `)
        .eq('user_id', person.id)
        .order('created_at', {
          ascending: false,
        }),

      supabase
        .from('profile_links')
        .select(`
          id,
          label,
          url,
          sort_order
        `)
        .eq('user_id', person.id)
        .order('sort_order', {
          ascending: true,
        })
        .order('id', {
          ascending: true,
        }),
    ])

    if (userInterestResult.error) {
      console.error(
        'Could not load profile interests:',
        userInterestResult.error
      )
    }

    if (userClubResult.error) {
      console.error(
        'Could not load profile clubs:',
        userClubResult.error
      )
    }

    if (workResult.error) {
      console.error(
        'Could not load work experience:',
        workResult.error
      )
    }

    if (projectResult.error) {
      console.error(
        'Could not load projects:',
        projectResult.error
      )
    }

    if (linkResult.error) {
      console.error(
        'Could not load profile links:',
        linkResult.error
      )
    }

    let loadedInterests: Interest[] = []

    const interestIds =
      (userInterestResult.data || [])
        .map(
          (row) =>
            row.interest_id
        )
        .filter(
          (id) =>
            id !== null &&
            id !== undefined
        )

    if (interestIds.length > 0) {
      const {
        data: interestData,
        error: interestError,
      } = await supabase
        .from('interests')
        .select(`
          id,
          name,
          category
        `)
        .in('id', interestIds)
        .order('name', {
          ascending: true,
        })

      if (interestError) {
        console.error(
          'Could not load interests:',
          interestError
        )
      } else {
        loadedInterests =
          (interestData || []) as Interest[]
      }
    }

    let loadedClubs: Club[] = []

    const clubIds =
      (userClubResult.data || [])
        .map(
          (row) =>
            row.club_id
        )
        .filter(
          (id) =>
            id !== null &&
            id !== undefined
        )

    if (clubIds.length > 0) {
      const {
        data: clubData,
        error: clubError,
      } = await supabase
        .from('clubs')
        .select(`
          id,
          name,
          description
        `)
        .in('id', clubIds)
        .order('name', {
          ascending: true,
        })

      if (clubError) {
        console.error(
          'Could not load clubs:',
          clubError
        )
      } else {
        loadedClubs =
          (clubData || []) as Club[]
      }
    }

    setSelectedProfileDetails({
      profile:
        detailedProfile,

      interests:
        loadedInterests,

      clubs:
        loadedClubs,

      workExperiences:
        (workResult.data ||
          []) as WorkExperience[],

      projects:
        (projectResult.data ||
          []) as Project[],

      links:
        canViewContact
          ? (linkResult.data ||
              []) as ProfileLink[]
          : [],

      canViewContact,
    })

    setProfileDetailsLoading(false)
  }

  function closeProfile() {
    setSelectedProfile(null)
    setSelectedProfileDetails(null)
    setProfileDetailsError('')
    setProfileDetailsLoading(false)
  }

  async function viewResume() {
    const resumePath =
      selectedProfileDetails?.profile
        .resume_url

    if (
      !resumePath ||
      !selectedProfileDetails
        ?.canViewContact
    ) {
      return
    }

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
      setProfileDetailsError(
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

  function formatExperienceDate(
    dateString: string | null
  ) {
    if (!dateString) {
      return ''
    }

    const date =
      new Date(
        `${dateString}T00:00:00`
      )

    return date.toLocaleDateString(
      [],
      {
        month: 'short',
        year: 'numeric',
      }
    )
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-sm">
            ☕
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Loading your network...
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] pb-28">

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-gray-200/70 bg-white/90 backdrop-blur">

        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-6">

          <button
            onClick={() => router.push('/dashboard')}
            className="text-xl font-bold tracking-tight"
          >
            Brework
          </button>

          <button
            onClick={() => router.push('/profile')}
            className="rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-black"
          >
            Profile
          </button>

        </div>

      </header>

      {/* Main */}
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-12">

        {/* Page heading */}
        <div className="flex items-start justify-between gap-4">

          <div>
            <div className="flex items-center gap-3">

              <p className="text-sm font-semibold uppercase tracking-widest text-gray-400">
                Network
              </p>

              {filteredRequests.length > 0 && (
                <span className="rounded-full bg-black px-2.5 py-1 text-xs font-bold text-white">
                  {pendingRequests.length} new
                </span>
              )}

            </div>

            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              Connections
            </h1>

            <p className="mt-3 max-w-lg text-gray-500">
              Build your network, meet interesting
              students, and start meaningful
              conversations.
            </p>
          </div>

        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mt-6">
          <label htmlFor="connection-search" className="mb-2 block text-sm font-semibold">
            Search connections
          </label>
          <div className="flex items-center gap-2">
            <input
              id="connection-search"
              type="search"
              value={searchQuery}
              onChange={event => {
                setSearchQuery(event.target.value)
                setOpenMenuId(null)
              }}
              placeholder="Search by name or major"
              className="block w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')}
                className="shrink-0 rounded-xl px-3 py-3 text-sm font-semibold">
                Clear
              </button>
            )}
          </div>
          {searchQuery.trim() && (
            <p role="status" className="mt-2 text-sm text-gray-500">
              {filteredConnections.length} connections and {filteredRequests.length} requests found
            </p>
          )}
        </div>

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <section className="mt-10">

            <div className="flex items-end justify-between">

              <div>
                <h2 className="text-2xl font-bold">
                  Connection Requests
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Students who want to connect with you.
                </p>
              </div>

              <span className="text-sm font-semibold text-gray-400">
                {filteredRequests.length}
              </span>

            </div>

            <div className="mt-5 space-y-4">

              {filteredRequests.map((connection) => {
                const person = connection.person
                const isLoading =
                  actionLoading === connection.id

                const name = getName(person)

                return (
                  <div
                    key={connection.id}
                    className="rounded-3xl border border-gray-200/70 bg-white p-6 shadow-sm transition hover:shadow-md"
                  >

                    {/* Profile */}
                    <div className="flex items-start gap-4">

                      <button
                        type="button"
                        onClick={() => {
                          if (person) {
                            openProfile(
                              person,
                              false
                            )
                          }
                        }}
                        className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-gray-100 transition hover:scale-105 hover:ring-2 hover:ring-gray-300"
                        aria-label={`View ${name}'s profile`}
                      >

                        {person?.profile_photo_url ? (
                          <img
                            src={person.profile_photo_url}
                            alt={`${name} profile`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-bold text-gray-400">
                            {getInitials(person)}
                          </span>
                        )}

                      </button>

                      <div className="min-w-0 flex-1">

                        <h3 className="text-lg font-bold">
                          {name}
                        </h3>

                        <p className="mt-1 text-sm text-gray-500">
                          {person?.major ||
                            'Major not listed'}

                          {person?.academic_year
                            ? ` • ${person.academic_year}`
                            : ''}
                        </p>

                      </div>

                      <span className="hidden rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500 sm:block">
                        Request
                      </span>

                    </div>

                    {/* Career */}
                    {person?.career_goal && (
                      <div className="mt-5">

                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                          Career interest
                        </p>

                        <p className="mt-1 font-semibold">
                          {person.career_goal}
                        </p>

                      </div>
                    )}

                    {/* Bio */}
                    {person?.bio && (
                      <div className="mt-5">

                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                          About
                        </p>

                        <p className="mt-1 text-sm leading-relaxed text-gray-600">
                          {person.bio}
                        </p>

                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-6 grid grid-cols-2 gap-3">

                      <button
                        onClick={() =>
                          handleRequestAction(
                            connection.id,
                            'declined'
                          )
                        }
                        disabled={isLoading}
                        className="rounded-xl border border-gray-200 px-4 py-3 font-semibold transition hover:bg-gray-50 disabled:opacity-50"
                      >
                        {isLoading
                          ? 'Updating...'
                          : 'Decline'}
                      </button>

                      <button
                        onClick={() =>
                          handleRequestAction(
                            connection.id,
                            'accepted'
                          )
                        }
                        disabled={isLoading}
                        className="rounded-xl bg-black px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                      >
                        {isLoading
                          ? 'Updating...'
                          : 'Accept'}
                      </button>

                    </div>

                  </div>
                )
              })}

            </div>

          </section>
        )}

        {/* Your Connections */}
        <section className="mt-12">

          <div className="flex items-end justify-between">

            <div>
              <h2 className="text-2xl font-bold">
                Your Connections
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Students you&apos;ve connected with.
              </p>
            </div>

            {connections.length > 0 && (
              <span className="text-sm font-semibold text-gray-400">
                {connections.length}
              </span>
            )}

          </div>

          {connections.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-gray-200/70 bg-white p-10 text-center shadow-sm">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 text-3xl">
                ☕
              </div>

              <h3 className="mt-5 text-lg font-bold">
                No connections yet
              </h3>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
                Discover students with similar
                interests and start building your
                network.
              </p>

              <button
                onClick={() => router.push('/discover')}
                className="mt-6 rounded-xl bg-black px-6 py-3 font-semibold text-white transition hover:opacity-90"
              >
                Discover Students
              </button>

            </div>
          ) : filteredConnections.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-gray-200/70 bg-white p-8 text-center">
              <h3 className="font-semibold">No connections match your search</h3>
              <p className="mt-2 text-sm text-gray-500">Try another name or clear your search.</p>
              <button type="button" onClick={() => setSearchQuery('')}
                className="mt-4 rounded-xl border border-gray-200 px-4 py-3 font-semibold">
                Clear search
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-4">

              {filteredConnections.map((connection) => {
                const person = connection.person

                if (!person) return null

                const name = getName(person)
                const matchId = getMatchId(person.id)

                return (
                  <div
                    key={connection.id}
                    className={`relative rounded-3xl border border-gray-200/70 bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6 ${openMenuId === connection.id ? 'z-30' : 'z-0'}`}
                  >

                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">

                      {/* Profile */}
                      <div className="flex min-w-0 flex-1 items-center gap-4">

                        <button
                          type="button"
                          onClick={() =>
                            openProfile(
                              person,
                              true
                            )
                          }
                          className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-gray-100 transition hover:scale-105 hover:ring-2 hover:ring-gray-300"
                          aria-label={`View ${name}'s profile`}
                        >

                          {person.profile_photo_url ? (
                            <img
                              src={person.profile_photo_url}
                              alt={`${name} profile`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-lg font-bold text-gray-400">
                              {getInitials(person)}
                            </span>
                          )}

                        </button>

                        <div className="min-w-0">

                          <h3 className="truncate text-lg font-bold">
                            {name}
                          </h3>

                          <p className="mt-1 text-sm text-gray-500">
                            {person.major ||
                              'Major not listed'}

                            {person.academic_year
                              ? ` • ${person.academic_year}`
                              : ''}
                          </p>

                        </div>

                      </div>

                      {/* Actions */}
                      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">

                        <button
                          onClick={() => {
                            if (!matchId) {
                              setError(
                                'Could not find an active chat for this connection.'
                              )
                              return
                            }

                            router.push(
                              `/chats/conversation?matchId=${matchId}`
                            )
                          }}
                          className="w-full rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 sm:w-auto"
                        >
                          Message
                        </button>

                        <button
                          onClick={() => {
                            if (!matchId) {
                              setError(
                                'Could not find an active match for this connection.'
                              )
                              return
                            }

                            router.push(
                              `/schedule?match=${matchId}`
                            )
                          }}
                          className="w-full rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 sm:w-auto"
                        >
                          Schedule Coffee Chat
                        </button>

                        <div className="relative" data-connection-menu={connection.id}>

                          <button
                            type="button"
                            onClick={() =>
                              setOpenMenuId(
                                (current) =>
                                  current ===
                                  connection.id
                                    ? null
                                    : connection.id
                              )
                            }
                            className="flex h-full min-h-[44px] w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-lg font-bold text-gray-500 transition hover:bg-gray-50 hover:text-black sm:w-auto"
                            aria-label={`More options for ${name}`}
                            aria-expanded={openMenuId === connection.id}
                            aria-controls={`connection-menu-${connection.id}`}
                          >
                            ⋯
                          </button>

                          {openMenuId ===
                            connection.id && (

                            <div id={`connection-menu-${connection.id}`} className="absolute bottom-full right-0 z-40 mb-2 w-56 max-w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">

                              <button
                                type="button"
                                onClick={() =>
                                  openReportModal(
                                    person
                                  )
                                }
                                className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
                              >
                                Report user
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null)

                                  setRelationshipAction({
                                    type: 'remove',
                                    connectionId:
                                      connection.id,
                                    person,
                                  })
                                }}
                                className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                              >
                                Remove connection
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null)

                                  setRelationshipAction({
                                    type: 'block',
                                    connectionId:
                                      connection.id,
                                    person,
                                  })
                                }}
                                className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
                              >
                                Block user
                              </button>

                            </div>

                          )}

                        </div>

                      </div>

                    </div>

                  </div>
                )
              })}

            </div>
          )}

        </section>

      </div>

      {/* ======================================== */}
      {/* REMOVE / BLOCK CONFIRMATION */}
      {/* ======================================== */}

      {relationshipAction && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5 backdrop-blur-sm">

          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl sm:p-7">

            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full text-xl ${
                relationshipAction.type ===
                'block'
                  ? 'bg-red-50'
                  : 'bg-gray-100'
              }`}
            >
              {relationshipAction.type ===
              'block'
                ? '🚫'
                : '👋'}
            </div>

            <h2 className="mt-5 text-2xl font-bold">
              {relationshipAction.type ===
              'block'
                ? `Block ${getName(
                    relationshipAction.person
                  )}?`
                : `Remove ${getName(
                    relationshipAction.person
                  )}?`}
            </h2>

            <p className="mt-3 text-sm leading-relaxed text-gray-500">
              {relationshipAction.type ===
              'block'
                ? 'This will remove your connection and close the active match. Blocking is intended to stop future interaction with this user.'
                : 'This will remove the connection and close the active match. You can connect with this person again later.'}
            </p>

            <div className="mt-7 grid grid-cols-2 gap-3">

              <button
                type="button"
                onClick={() =>
                  setRelationshipAction(
                    null
                  )
                }
                disabled={
                  relationshipLoading
                }
                className="rounded-xl border border-gray-200 px-4 py-3 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  handleRelationshipAction
                }
                disabled={
                  relationshipLoading
                }
                className={`rounded-xl px-4 py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  relationshipAction.type ===
                  'block'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-black hover:opacity-90'
                }`}
              >
                {relationshipLoading
                  ? 'Working...'
                  : relationshipAction.type ===
                    'block'
                    ? 'Block user'
                    : 'Remove'}
              </button>

            </div>

          </div>

        </div>

      )}

      {/* ======================================== */}
      {/* REPORT USER MODAL */}
      {/* ======================================== */}

      {reportAction && (

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
                  Thank you. We&apos;ll review this report and take appropriate action.
                </p>

                <button
                  type="button"
                  onClick={closeReportModal}
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
                  Report {getName(
                    reportAction.person
                  )}?
                </h2>

                <p className="mt-3 text-sm leading-relaxed text-gray-500">
                  Reports are confidential. Select the reason that best describes the issue.
                </p>

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
                    onClick={closeReportModal}
                    disabled={reportLoading}
                    className="rounded-xl border border-gray-200 px-4 py-3 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleReportUser}
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

      {/* ======================================== */}
      {/* PROFILE CARD MODAL */}
      {/* ======================================== */}

      {selectedProfile && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5 py-6 backdrop-blur-sm"
          onClick={
            closeProfile
          }
        >

          <div
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            {/* PHOTO */}

            <div className="relative aspect-[4/3.5] w-full shrink-0 overflow-hidden bg-gray-100">

              {selectedProfile.profile_photo_url ? (
                <img
                  src={
                    selectedProfile.profile_photo_url
                  }
                  alt={`${getName(
                    selectedProfile
                  )} profile`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">

                  <span className="text-7xl font-bold text-gray-300">
                    {getInitials(
                      selectedProfile
                    )}
                  </span>

                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

              <button
                type="button"
                onClick={
                  closeProfile
                }
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-gray-700 shadow-sm backdrop-blur transition hover:bg-white"
                aria-label="Close profile"
              >
                ✕
              </button>

              <div className="absolute bottom-5 left-5 right-5 text-white">

                <h2 className="text-3xl font-bold tracking-tight">
                  {getName(
                    selectedProfile
                  )}
                </h2>

                <p className="mt-1 text-sm font-medium text-white/90">

                  {selectedProfile.major ||
                    'Major not listed'}

                  {selectedProfile.academic_year
                    ? ` • ${selectedProfile.academic_year}`
                    : ''}

                </p>

              </div>

            </div>

            {/* PROFILE INFO */}

            <div className="overflow-y-auto p-6">

              {profileDetailsLoading && (

                <div className="py-10 text-center">

                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">
                    ☕
                  </div>

                  <p className="mt-4 text-sm font-medium text-gray-500">
                    Loading profile...
                  </p>

                </div>

              )}

              {profileDetailsError && (

                <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
                  {profileDetailsError}
                </div>

              )}

              {selectedProfileDetails &&
                !profileDetailsLoading && (

                <div className="space-y-7">

                  {/* CAREER */}

                  {selectedProfileDetails.profile
                    .career_goal && (

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                        Career interest
                      </p>

                      <div className="mt-2 inline-flex rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-800">
                        {
                          selectedProfileDetails
                            .profile
                            .career_goal
                        }
                      </div>

                    </div>

                  )}

                  {/* BIO */}

                  {selectedProfileDetails.profile.bio && (

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                        About
                      </p>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                        {
                          selectedProfileDetails
                            .profile.bio
                        }
                      </p>

                    </div>

                  )}

                  {/* INTERESTS */}

                  {selectedProfileDetails
                    .interests.length > 0 && (

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                        Interests
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">

                        {selectedProfileDetails
                          .interests.map(
                            (interest) => (

                              <span
                                key={
                                  interest.id
                                }
                                className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700"
                              >
                                {
                                  interest.name
                                }
                              </span>

                            )
                          )}

                      </div>

                    </div>

                  )}

                  {/* CLUBS */}

                  {selectedProfileDetails
                    .clubs.length > 0 && (

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                        Clubs & organizations
                      </p>

                      <div className="mt-3 space-y-2">

                        {selectedProfileDetails
                          .clubs.map(
                            (club) => (

                              <div
                                key={
                                  club.id
                                }
                                className="rounded-2xl bg-gray-50 p-4"
                              >

                                <p className="font-semibold text-gray-900">
                                  {
                                    club.name
                                  }
                                </p>

                                {club.description && (

                                  <p className="mt-1 text-sm leading-relaxed text-gray-500">
                                    {
                                      club.description
                                    }
                                  </p>

                                )}

                              </div>

                            )
                          )}

                      </div>

                    </div>

                  )}

                  {/* WORK EXPERIENCE */}

                  {selectedProfileDetails
                    .workExperiences
                    .length > 0 && (

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                        Work experience
                      </p>

                      <div className="mt-3 space-y-3">

                        {selectedProfileDetails
                          .workExperiences
                          .map(
                            (
                              experience
                            ) => (

                              <div
                                key={
                                  experience.id
                                }
                                className="rounded-2xl border border-gray-200 bg-white p-4"
                              >

                                <p className="font-semibold text-gray-900">
                                  {
                                    experience
                                      .role_title
                                  }
                                </p>

                                <p className="mt-1 text-sm font-medium text-gray-600">
                                  {
                                    experience
                                      .company_name
                                  }
                                </p>

                                <p className="mt-1 text-xs text-gray-400">

                                  {formatExperienceDate(
                                    experience
                                      .start_date
                                  )}

                                  {' – '}

                                  {experience
                                    .is_current
                                    ? 'Present'
                                    : formatExperienceDate(
                                        experience
                                          .end_date
                                      )}

                                </p>

                                {experience.industry && (

                                  <p className="mt-2 text-xs font-medium text-gray-500">
                                    {
                                      experience
                                        .industry
                                    }
                                  </p>

                                )}

                                {experience.description && (

                                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                                    {
                                      experience
                                        .description
                                    }
                                  </p>

                                )}

                              </div>

                            )
                          )}

                      </div>

                    </div>

                  )}

                  {/* PROJECTS */}

                  {selectedProfileDetails
                    .projects.length > 0 && (

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                        Projects
                      </p>

                      <div className="mt-3 space-y-3">

                        {selectedProfileDetails
                          .projects.map(
                            (project) => (

                              <div
                                key={
                                  project.id
                                }
                                className="rounded-2xl border border-gray-200 bg-white p-4"
                              >

                                <p className="font-semibold text-gray-900">
                                  {
                                    project.title
                                  }
                                </p>

                                {project.description && (

                                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                                    {
                                      project.description
                                    }
                                  </p>

                                )}

                              </div>

                            )
                          )}

                      </div>

                    </div>

                  )}

                  {/* LINKS */}

                  {selectedProfileDetails
                    .canViewContact &&
                    selectedProfileDetails
                      .links.length >
                      0 && (

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                        Links
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">

                        {selectedProfileDetails
                          .links.map(
                            (
                              link,
                              index
                            ) => (

                              <a
                                key={
                                  link.id ||
                                  `${link.label}-${index}`
                                }
                                href={
                                  link.url
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-blue-600 underline underline-offset-2 transition hover:bg-gray-200 hover:text-blue-800"
                              >
                                {
                                  link.label
                                }{' '}
                                ↗
                              </a>

                            )
                          )}

                      </div>

                    </div>

                  )}

                  {/* CONTACT EMAIL */}

                  {selectedProfileDetails
                    .canViewContact &&
                    selectedProfileDetails
                      .profile
                      .contact_email && (

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                        Contact
                      </p>

                      <a
                        href={`mailto:${selectedProfileDetails.profile.contact_email}`}
                        className="mt-2 inline-block text-sm font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-800"
                      >
                        {
                          selectedProfileDetails
                            .profile
                            .contact_email
                        }
                      </a>

                    </div>

                  )}

                  {/* RESUME */}

                  {selectedProfileDetails
                    .canViewContact &&
                    selectedProfileDetails
                      .profile
                      .resume_url && (

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                        Resume
                      </p>

                      <button
                        type="button"
                        onClick={
                          viewResume
                        }
                        className="mt-3 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                      >
                        View Resume ↗
                      </button>

                    </div>

                  )}

                  {/* EMPTY PROFILE */}

                  {!selectedProfileDetails
                    .profile.bio &&
                    !selectedProfileDetails
                      .profile
                      .career_goal &&
                    selectedProfileDetails
                      .interests.length ===
                      0 &&
                    selectedProfileDetails
                      .clubs.length ===
                      0 &&
                    selectedProfileDetails
                      .workExperiences
                      .length ===
                      0 &&
                    selectedProfileDetails
                      .projects.length ===
                      0 && (

                    <div className="rounded-2xl bg-gray-50 p-5 text-center">

                      <p className="text-sm text-gray-500">
                        This student hasn&apos;t added additional profile information yet.
                      </p>

                    </div>

                  )}

                </div>

              )}

            </div>

          </div>

        </div>

      )}

      {/* Bottom navigation */}
      <BottomNav />

    </main>
  )
}
