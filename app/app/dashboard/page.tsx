'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BottomNav from '../components/BottomNav'

type Profile = {
  id?: string
  first_name: string | null
  last_name: string | null
  major?: string | null
  academic_year?: string | null
  career_goal?: string | null
  profile_photo_url?: string | null
  is_discoverable?: boolean
  show_academic_info?: boolean
  show_career_goal?: boolean
}

type RecommendedProfile = {
  profile: {
    id: string
    first_name: string | null
    last_name: string | null
    major: string | null
    academic_year: string | null
    career_goal: string | null
    profile_photo_url: string | null
    is_discoverable: boolean
    show_academic_info: boolean
    show_career_goal: boolean
  }
  score: number
  reasons: string[]
}

type Match = {
  id: number
  user_1_id: string
  user_2_id: string
  status: string | null
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

type FeedbackRating =
  | 'great'
  | 'okay'
  | 'not_a_fit'

type WouldMeetAgain =
  | 'yes'
  | 'maybe'
  | 'no'

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] =
    useState<Profile | null>(null)

  const [connectionCount, setConnectionCount] =
    useState(0)

  const [unreadNotifications, setUnreadNotifications] =
    useState(0)

  const [upcomingMeetings, setUpcomingMeetings] =
    useState<Meeting[]>([])

  const [upcomingMeetingCount, setUpcomingMeetingCount] =
    useState(0)

  const [
    pendingFeedbackMeetings,
    setPendingFeedbackMeetings,
  ] =
    useState<Meeting[]>([])

  const [
    selectedFeedbackRatings,
    setSelectedFeedbackRatings,
  ] =
    useState<
      Record<number, FeedbackRating>
    >({})

  const [
    selectedMeetAgainAnswers,
    setSelectedMeetAgainAnswers,
  ] =
    useState<
      Record<number, WouldMeetAgain>
    >({})

  const [
    submittingFeedback,
    setSubmittingFeedback,
  ] =
    useState(false)

  const [
    submittedFeedbackMeetingId,
    setSubmittedFeedbackMeetingId,
  ] =
    useState<number | null>(null)

  const [matches, setMatches] =
    useState<Match[]>([])

  const [chatProfiles, setChatProfiles] =
    useState<Record<string, Profile>>({})

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [userId, setUserId] =
    useState('')

  const [
    recommendedProfiles,
    setRecommendedProfiles,
  ] =
    useState<RecommendedProfile[]>([])

  const [
    connectingRecommendationId,
    setConnectingRecommendationId,
  ] =
    useState<string | null>(null)

  // ============================================
  // LOAD UPCOMING MEETINGS
  // ============================================

  const loadUpcomingMeetings = useCallback(
    async (currentUserId: string) => {

      // ------------------------------------------
      // GET USER'S MATCHES
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
            `user_1_id.eq.${currentUserId},user_2_id.eq.${currentUserId}`
          )
          .eq('status', 'active')

      if (matchError) {
        console.error(
          'Could not load matches:',
          matchError
        )

        setError(
          'Could not load your coffee chats.'
        )

        return
      }

      const loadedMatches =
        (matchData || []) as Match[]

      setMatches(loadedMatches)

      // ------------------------------------------
      // GET MATCH IDS
      // ------------------------------------------

      const matchIds =
        loadedMatches.map(
          (match) => match.id
        )

      if (matchIds.length === 0) {
        setUpcomingMeetings([])
        setUpcomingMeetingCount(0)
        setPendingFeedbackMeetings([])
        setChatProfiles({})
        return
      }

      // ------------------------------------------
      // GET ALL NON-CANCELLED MEETINGS
      // ------------------------------------------

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
          .in(
            'match_id',
            matchIds
          )
          .neq(
            'status',
            'cancelled'
          )
          .order(
            'scheduled_date',
            {
              ascending: true,
            }
          )
          .order(
            'start_time',
            {
              ascending: true,
            }
          )

      if (meetingError) {
        console.error(
          'Could not load meetings:',
          meetingError
        )

        setError(
          'Could not load your coffee chats.'
        )

        return
      }

      const allMeetings =
        (meetingData ?? []) as Meeting[]

      const now =
        new Date()

      // ==========================================
      // UPCOMING MEETINGS
      // ==========================================

      const upcoming =
        allMeetings.filter(
          (meeting) => {

            if (
              meeting.status !==
                'scheduled' ||
              !meeting.scheduled_date ||
              !meeting.start_time
            ) {
              return false
            }

            const meetingDateTime =
              new Date(
                `${meeting.scheduled_date}T${meeting.start_time}`
              )

            return (
              meetingDateTime >=
              now
            )
          }
        )

      setUpcomingMeetingCount(
        upcoming.length
      )

      setUpcomingMeetings(
        upcoming.slice(0, 3)
      )

      // ==========================================
      // COMPLETED MEETINGS
      // ==========================================

      const completedMeetings =
        allMeetings.filter(
          (meeting) => {

            if (
              !meeting.scheduled_date ||
              !meeting.start_time
            ) {
              return false
            }

            const completedTime =
              meeting.end_time ||
              meeting.start_time

            const completedAt =
              new Date(
                `${meeting.scheduled_date}T${completedTime}`
              )

            return (
              completedAt <
              now
            )
          }
        )

      // ==========================================
      // CHECK WHICH COMPLETED MEETINGS
      // ALREADY HAVE FEEDBACK
      // ==========================================

      let waitingForFeedback:
        Meeting[] = []

      if (
        completedMeetings.length >
        0
      ) {

        const completedMeetingIds =
          completedMeetings.map(
            (meeting) =>
              meeting.id
          )

        const {
          data: feedbackData,
          error: feedbackError,
        } =
          await supabase
            .from(
              'meeting_feedback'
            )
            .select(
              'meeting_id'
            )
            .eq(
              'user_id',
              currentUserId
            )
            .in(
              'meeting_id',
              completedMeetingIds
            )

        if (feedbackError) {
          console.error(
            'Could not load meeting feedback:',
            feedbackError
          )

          setError(
            'Could not check your coffee chat follow-ups.'
          )
        } else {

          const meetingsWithFeedback =
            new Set(
              (feedbackData || []).map(
                (feedback) =>
                  feedback.meeting_id
              )
            )

          waitingForFeedback =
            completedMeetings
              .filter(
                (meeting) =>
                  !meetingsWithFeedback.has(
                    meeting.id
                  )
              )
              .sort(
                (a, b) => {

                  const aDate =
                    new Date(
                      `${a.scheduled_date}T${
                        a.end_time ||
                        a.start_time
                      }`
                    ).getTime()

                  const bDate =
                    new Date(
                      `${b.scheduled_date}T${
                        b.end_time ||
                        b.start_time
                      }`
                    ).getTime()

                  return (
                    bDate - aDate
                  )
                }
              )
        }
      }

      setPendingFeedbackMeetings(
        waitingForFeedback
      )

      console.log(
        'Coffee chats waiting for feedback:',
        waitingForFeedback
      )

      // ------------------------------------------
      // GET OTHER USERS
      // ------------------------------------------

      const otherUserIds:
        string[] = []

      const meetingsNeedingProfiles =
        [
          ...upcoming,
          ...waitingForFeedback,
        ]

      meetingsNeedingProfiles.forEach(
        (meeting) => {

          const match =
            loadedMatches.find(
              (item) =>
                item.id ===
                meeting.match_id
            )

          if (!match) {
            return
          }

          const otherUserId =
            match.user_1_id ===
            currentUserId
              ? match.user_2_id
              : match.user_1_id

          otherUserIds.push(
            otherUserId
          )
        }
      )

      const uniqueOtherUserIds =
        [
          ...new Set(
            otherUserIds
          ),
        ]

      if (
        uniqueOtherUserIds.length ===
        0
      ) {
        setChatProfiles({})
        return
      }

      // ------------------------------------------
      // GET PROFILES
      // ------------------------------------------

      const {
        data: profileData,
        error: profileError,
      } =
        await supabase
          .from('profiles')
          .select(`
            id,
            first_name,
            last_name
          `)
          .in(
            'id',
            uniqueOtherUserIds
          )

      if (profileError) {
        console.error(
          'Could not load meeting profiles:',
          profileError
        )

        return
      }

      const profileMap:
        Record<string, Profile> = {}

      ;(profileData ?? []).forEach(
        (profile) => {
          profileMap[
            profile.id
          ] = profile
        }
      )

      setChatProfiles(
        profileMap
      )
    },
    [supabase]
  )

  // ============================================
  // LOAD RECOMMENDED PEOPLE
  // ============================================

  const loadRecommendedProfiles = useCallback(
    async (
      currentUserId: string
    ) => {

      // ------------------------------------------
      // GET YOUR MATCHING PROFILE
      // ------------------------------------------

      const {
        data: myProfile,
        error: myProfileError,
      } =
        await supabase
          .from('profiles')
          .select(`
            id,
            major,
            academic_year,
            career_goal
          `)
          .eq(
            'id',
            currentUserId
          )
          .single()

      if (
        myProfileError ||
        !myProfile
      ) {
        console.error(
          'Could not load recommendation profile:',
          myProfileError
        )

        setRecommendedProfiles([])
        return
      }

      // ------------------------------------------
      // GET EXISTING CONNECTIONS
      // ------------------------------------------

      const {
        data: connections,
        error: connectionsError,
      } =
        await supabase
          .from('connections')
          .select(`
            sender_id,
            receiver_id,
            status
          `)
          .or(
            `sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`
          )

      if (connectionsError) {
        console.error(
          'Could not load recommendation connections:',
          connectionsError
        )

        setRecommendedProfiles([])
        return
      }

      // ------------------------------------------
      // GET BLOCKED RELATIONSHIPS
      // ------------------------------------------

      const {
        data: blockedRelationships,
        error: blockedRelationshipsError,
      } =
        await supabase
          .from('blocked_users')
          .select(`
            blocker_id,
            blocked_id
          `)
          .or(
            `blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`
          )

      if (blockedRelationshipsError) {
        console.error(
          'Could not load blocked users for recommendations:',
          blockedRelationshipsError
        )

        setRecommendedProfiles([])
        return
      }

      // ------------------------------------------
      // BUILD EXCLUDED USER LIST
      // ------------------------------------------

      const excludedUserIds =
        new Set<string>()

      ;(connections || []).forEach(
        (connection) => {

          const otherUserId =
            connection.sender_id ===
            currentUserId
              ? connection.receiver_id
              : connection.sender_id

          if (
            connection.status ===
              'accepted' ||
            connection.status ===
              'pending'
          ) {
            excludedUserIds.add(
              otherUserId
            )
          }
        }
      )

      ;(blockedRelationships || []).forEach(
        (blockedRelationship) => {

          const otherUserId =
            blockedRelationship.blocker_id ===
            currentUserId
              ? blockedRelationship.blocked_id
              : blockedRelationship.blocker_id

          excludedUserIds.add(
            otherUserId
          )
        }
      )

      // ------------------------------------------
      // GET DISCOVERABLE STUDENTS
      // ------------------------------------------

      const {
        data: allProfiles,
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
            career_goal,
            profile_photo_url,
            is_discoverable,
            show_academic_info,
            show_career_goal
          `)
          .neq(
            'id',
            currentUserId
          )
          .eq(
            'is_discoverable',
            true
          )

      if (profilesError) {
        console.error(
          'Could not load recommended students:',
          profilesError
        )

        setRecommendedProfiles([])
        return
      }

      const availableProfiles =
        (allProfiles || []).filter(
          (profile) =>
            !excludedUserIds.has(
              profile.id
            )
        )

      // ------------------------------------------
      // SCORE USING THE SAME DISCOVER ALGORITHM
      // ------------------------------------------

      const scoredProfiles:
        RecommendedProfile[] =
        availableProfiles.map(
          (profile) => {

            let score = 0

            const reasons:
              string[] = []

            // Same career goal = +3
            if (
              myProfile.career_goal &&
              profile.career_goal &&
              myProfile.career_goal
                .trim()
                .toLowerCase() ===
                profile.career_goal
                  .trim()
                  .toLowerCase()
            ) {
              score += 3

              if (
                profile.show_career_goal
              ) {
                reasons.push(
                  'Same career interest'
                )
              }
            }

            // Same major = +2
            if (
              myProfile.major &&
              profile.major &&
              myProfile.major
                .trim()
                .toLowerCase() ===
                profile.major
                  .trim()
                  .toLowerCase()
            ) {
              score += 2

              if (
                profile.show_academic_info
              ) {
                reasons.push(
                  'Same major'
                )
              }
            }

            // Same academic year = +1
            if (
              myProfile.academic_year &&
              profile.academic_year &&
              myProfile.academic_year
                .trim()
                .toLowerCase() ===
                profile.academic_year
                  .trim()
                  .toLowerCase()
            ) {
              score += 1

              if (
                profile.show_academic_info
              ) {
                reasons.push(
                  'Same academic year'
                )
              }
            }

            return {
              profile,
              score,
              reasons,
            }
          }
        )

      // Highest compatibility first.
      scoredProfiles.sort(
        (a, b) =>
          b.score - a.score
      )

      if (
        scoredProfiles.length === 0
      ) {
        setRecommendedProfiles([])
        return
      }

      // ------------------------------------------
      // BUILD A HIGH-QUALITY POOL
      //
      // We keep recommendations relevant, but
      // shuffle the best candidates so refreshing
      // the Dashboard can show different people.
      // ------------------------------------------

      const highestScore =
        scoredProfiles[0].score

      let candidatePool =
        scoredProfiles.filter(
          (candidate) =>
            candidate.score >=
            Math.max(
              highestScore - 1,
              0
            )
        )

      if (
        candidatePool.length < 3
      ) {
        candidatePool =
          scoredProfiles.slice(
            0,
            Math.min(
              8,
              scoredProfiles.length
            )
          )
      } else {
        candidatePool =
          candidatePool.slice(
            0,
            Math.min(
              8,
              candidatePool.length
            )
          )
      }

      const shuffledPool =
        [...candidatePool]

      for (
        let index =
          shuffledPool.length - 1;
        index > 0;
        index -= 1
      ) {
        const randomIndex =
          Math.floor(
            Math.random() *
            (index + 1)
          )

        ;[
          shuffledPool[index],
          shuffledPool[randomIndex],
        ] = [
          shuffledPool[randomIndex],
          shuffledPool[index],
        ]
      }

      setRecommendedProfiles(
        shuffledPool.slice(
          0,
          3
        )
      )
    },
    [supabase]
  )

  // ============================================
  // SEND RECOMMENDED CONNECTION REQUEST
  // ============================================

  async function connectWithRecommendedProfile(
    recommendedProfile:
      RecommendedProfile
  ) {
    if (
      !userId ||
      connectingRecommendationId
    ) {
      return
    }

    const targetUserId =
      recommendedProfile.profile.id

    setConnectingRecommendationId(
      targetUserId
    )

    setError('')

    // ------------------------------------------
    // CHECK FOR BLOCK
    // ------------------------------------------

    const {
      data: blockedRelationship,
      error: blockedRelationshipError,
    } =
      await supabase
        .from('blocked_users')
        .select(`
          blocker_id,
          blocked_id
        `)
        .or(
          `and(blocker_id.eq.${userId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${userId})`
        )
        .maybeSingle()

    if (blockedRelationshipError) {
      setError(
        `Could not check blocked users: ${blockedRelationshipError.message}`
      )

      setConnectingRecommendationId(
        null
      )
      return
    }

    if (blockedRelationship) {
      setError(
        'You cannot connect with this student.'
      )

      setRecommendedProfiles(
        (current) =>
          current.filter(
            (candidate) =>
              candidate.profile.id !==
              targetUserId
          )
      )

      setConnectingRecommendationId(
        null
      )
      return
    }

    // ------------------------------------------
    // CHECK FOR EXISTING CONNECTION
    // ------------------------------------------

    const {
      data: existingConnection,
      error: existingConnectionError,
    } =
      await supabase
        .from('connections')
        .select(`
          id,
          sender_id,
          receiver_id,
          status
        `)
        .or(
          `and(sender_id.eq.${userId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${userId})`
        )
        .maybeSingle()

    if (existingConnectionError) {
      setError(
        `Could not check connection: ${existingConnectionError.message}`
      )

      setConnectingRecommendationId(
        null
      )
      return
    }

    if (existingConnection) {
      setRecommendedProfiles(
        (current) =>
          current.filter(
            (candidate) =>
              candidate.profile.id !==
              targetUserId
          )
      )

      setConnectingRecommendationId(
        null
      )
      return
    }

    // ------------------------------------------
    // CREATE CONNECTION REQUEST
    // ------------------------------------------

    const {
      error: insertError,
    } =
      await supabase
        .from('connections')
        .insert({
          sender_id:
            userId,
          receiver_id:
            targetUserId,
          status:
            'pending',
        })

    if (insertError) {
      setError(
        `Could not send connection request: ${insertError.message}`
      )

      setConnectingRecommendationId(
        null
      )
      return
    }

    // Remove the person immediately, then
    // refill the recommendation row.
    setRecommendedProfiles(
      (current) =>
        current.filter(
          (candidate) =>
            candidate.profile.id !==
            targetUserId
        )
    )

    setConnectingRecommendationId(
      null
    )

    await loadRecommendedProfiles(
      userId
    )

    window.dispatchEvent(
      new CustomEvent(
        'brewlink:connection-change'
      )
    )
  }

  function getRecommendedName(
    recommendedProfile:
      RecommendedProfile
  ) {
    const person =
      recommendedProfile.profile

    const fullName =
      (
        `${person.first_name || ''} ` +
        `${person.last_name || ''}`
      ).trim()

    return (
      fullName ||
      'Student'
    )
  }

  function getRecommendedInitials(
    recommendedProfile:
      RecommendedProfile
  ) {
    const person =
      recommendedProfile.profile

    const first =
      person.first_name?.charAt(0) ||
      ''

    const last =
      person.last_name?.charAt(0) ||
      ''

    return (
      `${first}${last}`.toUpperCase() ||
      '?'
    )
  }

  function getRecommendationMatchPercentage(
    score: number
  ) {
    return Math.round(
      (score / 6) * 100
    )
  }

  // ============================================
  // LOAD DASHBOARD DATA
  // ============================================

  const loadDashboardData =
    useCallback(
      async (
        currentUserId: string
      ) => {

        setError('')

        // ========================================
        // PROFILE
        // ========================================

      // Independent reads run together; existing validation and state updates stay below.
      const initialLoadResults = await Promise.all([
        supabase
            .from('profiles')
            .select(
              'first_name, last_name'
            )
            .eq(
              'id',
              currentUserId
            )
            .single(),
        supabase
            .from('connections')
            .select('id')
            .or(
              `sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`
            )
            .eq(
              'status',
              'accepted'
            ),
        supabase
            .from('notifications')
            .select('id')
            .eq(
              'user_id',
              currentUserId
            )
            .eq(
              'is_read',
              false
            ),
        loadUpcomingMeetings(currentUserId),
        loadRecommendedProfiles(currentUserId)
      ])

        const {
          data: profileData,
          error: profileError,
        } =
          initialLoadResults[0]

        if (profileError) {
          console.error(
            'Could not load profile:',
            profileError
          )
        } else {
          setProfile(
            profileData
          )
        }

        // ========================================
        // CONNECTIONS
        // ========================================

        const {
          data: connections,
          error: connectionsError,
        } =
          initialLoadResults[1]

        if (connectionsError) {
          console.error(
            'Could not load connections:',
            connectionsError
          )
        } else {
          setConnectionCount(
            connections?.length ?? 0
          )
        }

        // ========================================
        // NOTIFICATIONS
        // ========================================

        const {
          data: notifications,
          error: notificationsError,
        } =
          initialLoadResults[2]

        if (notificationsError) {
          console.error(
            'Could not load notifications:',
            notificationsError
          )
        } else {
          setUnreadNotifications(
            notifications?.length ?? 0
          )
        }

        // ========================================
        // MEETINGS
        // ========================================



        // ========================================
        // RECOMMENDED PEOPLE
        // ========================================



        setLoading(false)
      },
      [
        supabase,
        loadUpcomingMeetings,
        loadRecommendedProfiles,
      ]
    )

  // ============================================
  // INITIAL LOAD
  // ============================================

  useEffect(() => {

    async function initialize() {

      setLoading(true)
      setError('')

      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser()

      if (
        userError ||
        !user
      ) {
        router.push('/login')
        return
      }

      setUserId(
        user.id
      )

      await loadDashboardData(
        user.id
      )
    }

    initialize()

  }, [
    router,
    supabase,
    loadDashboardData,
  ])

  // ============================================
  // REALTIME DASHBOARD UPDATES
  // ============================================

  useEffect(() => {

    if (!userId) {
      return
    }

    console.log(
      `Starting dashboard realtime listeners for ${userId}`
    )

    // ==========================================
    // NOTIFICATIONS
    // ==========================================

    const notificationChannel =
      supabase
        .channel(
          `dashboard-notifications-${userId}`
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter:
              `user_id=eq.${userId}`,
          },
          async () => {

            const {
              data,
              error,
            } =
              await supabase
                .from('notifications')
                .select('id')
                .eq(
                  'user_id',
                  userId
                )
                .eq(
                  'is_read',
                  false
                )

            if (error) {
              console.error(
                'Could not refresh notifications:',
                error
              )

              return
            }

            setUnreadNotifications(
              data?.length ?? 0
            )
          }
        )
        .subscribe()

    // ==========================================
    // CONNECTIONS
    // ==========================================

    const connectionChannel =
      supabase
        .channel(
          `dashboard-connections-${userId}`
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'connections',
          },
          async () => {

            const {
              data,
              error,
            } =
              await supabase
                .from('connections')
                .select('id')
                .or(
                  `sender_id.eq.${userId},receiver_id.eq.${userId}`
                )
                .eq(
                  'status',
                  'accepted'
                )

            if (error) {
              console.error(
                'Could not refresh connections:',
                error
              )

              return
            }

            setConnectionCount(
              data?.length ?? 0
            )

            await loadRecommendedProfiles(
              userId
            )
          }
        )
        .subscribe()

    // ==========================================
    // MEETINGS
    // ==========================================

    const meetingChannel =
      supabase
        .channel(
          `dashboard-meetings-${userId}`
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'meetings',
          },
          async () => {

            console.log(
              'Dashboard meeting changed'
            )

            await loadUpcomingMeetings(
              userId
            )
          }
        )
        .subscribe()

    // ==========================================
    // CLEANUP
    // ==========================================

    return () => {

      console.log(
        'Removing dashboard realtime listeners'
      )

      supabase.removeChannel(
        notificationChannel
      )

      supabase.removeChannel(
        connectionChannel
      )

      supabase.removeChannel(
        meetingChannel
      )
    }

  }, [
    userId,
    supabase,
    loadUpcomingMeetings,
    loadRecommendedProfiles,
  ])

  // ============================================
  // GET MEETING PARTNER
  // ============================================

  function getMeetingPartner(
    meeting: Meeting
  ) {

    const match =
      matches.find(
        (item) =>
          item.id ===
          meeting.match_id
      )

    if (!match) {
      return null
    }

    const otherUserId =
      match.user_1_id === userId
        ? match.user_2_id
        : match.user_1_id

    return (
      chatProfiles[
        otherUserId
      ] || null
    )
  }

  function getMeetingPartnerName(
    meeting: Meeting
  ) {

    const partner =
      getMeetingPartner(
        meeting
      )

    if (!partner) {
      return 'Brework match'
    }

    const fullName =
      (
        `${partner.first_name || ''} ` +
        `${partner.last_name || ''}`
      ).trim()

    return (
      fullName ||
      'Brework match'
    )
  }

  // ============================================
  // SUBMIT COFFEE CHAT FEEDBACK
  // ============================================

  async function submitMeetingFeedback(
    meeting: Meeting
  ) {
    if (
      !userId ||
      submittingFeedback
    ) {
      return
    }

    const rating =
      selectedFeedbackRatings[
        meeting.id
      ]

    const wouldMeetAgain =
      selectedMeetAgainAnswers[
        meeting.id
      ]

    if (
      !rating ||
      !wouldMeetAgain
    ) {
      return
    }

    setSubmittingFeedback(true)
    setError('')

    const {
      error: feedbackError,
    } =
      await supabase
        .from('meeting_feedback')
        .insert({
          meeting_id:
            meeting.id,
          user_id:
            userId,
          rating,
          would_meet_again:
            wouldMeetAgain,
        })

    if (feedbackError) {
      console.error(
        'Could not submit meeting feedback:',
        feedbackError
      )

      setError(
        `Could not save your feedback: ${feedbackError.message}`
      )

      setSubmittingFeedback(false)
      return
    }

    setSubmittedFeedbackMeetingId(
      meeting.id
    )

    setSubmittingFeedback(false)
  }

  function finishFeedback(
    meetingId: number
  ) {
    setPendingFeedbackMeetings(
      (current) =>
        current.filter(
          (meeting) =>
            meeting.id !==
            meetingId
        )
    )

    setSelectedFeedbackRatings(
      (current) => {
        const next = {
          ...current,
        }

        delete next[
          meetingId
        ]

        return next
      }
    )

    setSelectedMeetAgainAnswers(
      (current) => {
        const next = {
          ...current,
        }

        delete next[
          meetingId
        ]

        return next
      }
    )

    setSubmittedFeedbackMeetingId(
      null
    )
  }

  // ============================================
  // FORMAT MEETING DATE
  // ============================================

  function formatMeetingDate(
    scheduledDate: string | null,
    startTime: string | null,
    endTime: string | null
  ) {

    if (
      !scheduledDate ||
      !startTime
    ) {
      return 'Time not scheduled'
    }

    const dateTime =
      new Date(
        `${scheduledDate}T${startTime}`
      )

    const formattedDate =
      dateTime.toLocaleDateString(
        [],
        {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }
      )

    const formattedStart =
      dateTime.toLocaleTimeString(
        [],
        {
          hour: 'numeric',
          minute: '2-digit',
        }
      )

    let formattedEnd = ''

    if (endTime) {

      const endDateTime =
        new Date(
          `${scheduledDate}T${endTime}`
        )

      formattedEnd =
        endDateTime.toLocaleTimeString(
          [],
          {
            hour: 'numeric',
            minute: '2-digit',
          }
        )
    }

    if (formattedEnd) {
      return `${formattedDate} · ${formattedStart}–${formattedEnd}`
    }

    return `${formattedDate} · ${formattedStart}`
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
            Loading Brework...
          </p>

        </div>

      </main>
    )
  }

  // ============================================
  // NAME
  // ============================================

  const firstName =
    profile?.first_name ||
    'there'

  const feedbackMeeting =
    pendingFeedbackMeetings[0]

  const selectedFeedbackRating =
    feedbackMeeting
      ? selectedFeedbackRatings[
          feedbackMeeting.id
        ]
      : undefined

  const selectedMeetAgainAnswer =
    feedbackMeeting
      ? selectedMeetAgainAnswers[
          feedbackMeeting.id
        ]
      : undefined

  const feedbackSubmitted =
    Boolean(
      feedbackMeeting &&
      submittedFeedbackMeetingId ===
        feedbackMeeting.id
    )

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
              router.push(
                '/dashboard'
              )
            }
            className="text-xl font-bold tracking-tight transition hover:opacity-70"
          >
            Brework
          </button>

          <div className="flex items-center gap-2">

            <button
              onClick={() =>
                router.push(
                  '/notifications'
                )
              }
              aria-label="Notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-lg transition hover:bg-gray-100"
            >
              🔔

              {unreadNotifications >
                0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[9px] font-bold text-white">
                  {unreadNotifications >
                  9
                    ? '9+'
                    : unreadNotifications}
                </span>
              )}

            </button>

            <button
              onClick={() =>
                router.push(
                  '/settings'
                )
              }
              className="rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-black"
            >
              Settings
            </button>

            <button
              onClick={() =>
                router.push(
                  '/profile'
                )
              }
              className="rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-black"
            >
              Profile
            </button>

          </div>

        </div>

      </header>

      {/* MAIN */}

      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 sm:py-12">

        {/* WELCOME */}

        <section className="mb-10">

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
            Your Brework
          </p>

          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            Hey, {firstName}.
          </h1>

          <p className="mt-3 max-w-xl text-base leading-relaxed text-gray-500">
            Build meaningful connections with
            students who share your interests,
            goals, and ambitions.
          </p>

        </section>

        {/* DISCOVER CTA */}

        <section className="mb-8">

          <button
            onClick={() =>
              router.push(
                '/discover'
              )
            }
            className="group w-full overflow-hidden rounded-[2rem] bg-black p-7 text-left text-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg sm:p-9"
          >

            <div className="flex items-center justify-between gap-6">

              <div>

                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/50">
                  Start connecting
                </p>

                <h2 className="mt-2 text-3xl font-bold tracking-tight">
                  Find your people.
                </h2>

                <p className="mt-3 max-w-md text-sm leading-relaxed text-white/65">
                  Discover students matched to your
                  major, career interests, and academic
                  year.
                </p>

              </div>

              <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/10 text-3xl transition group-hover:scale-110 sm:flex">
                ✨
              </div>

            </div>

            <div className="mt-7 inline-flex items-center rounded-xl bg-white px-5 py-3 text-sm font-bold text-black transition group-hover:bg-gray-100">
              Discover students

              <span className="ml-2">
                →
              </span>
            </div>

          </button>

        </section>

        {/* STATS */}

        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">

          <button
            onClick={() =>
              router.push(
                '/connections'
              )
            }
            className="rounded-2xl border border-gray-200/70 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
              👥
            </div>

            <p className="mt-5 text-3xl font-bold">
              {connectionCount}
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Connections
            </p>

          </button>

          <button
            onClick={() =>
              router.push(
                '/notifications'
              )
            }
            className="rounded-2xl border border-gray-200/70 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
              🔔
            </div>

            <p className="mt-5 text-3xl font-bold">
              {unreadNotifications}
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Unread
            </p>

          </button>

          <button
            onClick={() =>
              router.push(
                '/coffee-chats?view=calendar'
              )
            }
            className="col-span-2 rounded-2xl border border-gray-200/70 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:col-span-1"
          >

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
              📅
            </div>

            <p className="mt-5 text-3xl font-bold">
              {
                upcomingMeetingCount
              }
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Upcoming chats
            </p>

          </button>

        </section>

        {/* COFFEE CHAT FOLLOW-UP */}

        {feedbackMeeting && (

          <section className="mb-8">

            <div className="rounded-[2rem] border border-gray-200/70 bg-white p-6 shadow-sm sm:p-7">

              {feedbackSubmitted ? (

                <div>

                  <div className="flex items-start gap-4">

                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-50 text-xl">
                      ✓
                    </div>

                    <div className="min-w-0 flex-1">

                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                        Feedback saved
                      </p>

                      <h2 className="mt-2 text-2xl font-bold tracking-tight">
                        Thanks for the feedback ☕
                      </h2>

                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500">
                        Want to catch up with{' '}
                        {getMeetingPartnerName(
                          feedbackMeeting
                        )}{' '}
                        again?
                      </p>

                    </div>

                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">

                    <button
                      type="button"
                      onClick={() => {
                        if (
                          feedbackMeeting.match_id
                        ) {
                          router.push(
                            `/schedule?match=${feedbackMeeting.match_id}`
                          )

                          return
                        }

                        router.push(
                          '/schedule'
                        )
                      }}
                      className="rounded-2xl bg-black px-5 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:opacity-90"
                    >
                      ☕ Schedule another coffee chat
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        finishFeedback(
                          feedbackMeeting.id
                        )
                      }
                      className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    >
                      Done
                    </button>

                  </div>

                </div>

              ) : (

                <>

                  <div className="flex items-start gap-4">

                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl">
                      ☕
                    </div>

                    <div className="min-w-0 flex-1">

                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                        Quick follow-up
                      </p>

                      <h2 className="mt-2 text-2xl font-bold tracking-tight">
                        How was your coffee chat with{' '}
                        {getMeetingPartnerName(
                          feedbackMeeting
                        )}?
                      </h2>

                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500">
                        Give Brework a quick signal so we can make your future matches better.
                      </p>

                    </div>

                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFeedbackRatings(
                          (current) => ({
                            ...current,
                            [feedbackMeeting.id]:
                              'great',
                          })
                        )

                        setSelectedMeetAgainAnswers(
                          (current) => {
                            const next = {
                              ...current,
                            }

                            delete next[
                              feedbackMeeting.id
                            ]

                            return next
                          }
                        )
                      }}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        selectedFeedbackRating ===
                        'great'
                          ? 'border-black bg-black text-white shadow-sm'
                          : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-white'
                      }`}
                    >
                      <div className="text-xl">
                        👍
                      </div>

                      <p className="mt-2 font-semibold">
                        Great
                      </p>

                      <p
                        className={`mt-1 text-xs ${
                          selectedFeedbackRating ===
                          'great'
                            ? 'text-white/60'
                            : 'text-gray-400'
                        }`}
                      >
                        Really enjoyed it
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFeedbackRatings(
                          (current) => ({
                            ...current,
                            [feedbackMeeting.id]:
                              'okay',
                          })
                        )

                        setSelectedMeetAgainAnswers(
                          (current) => {
                            const next = {
                              ...current,
                            }

                            delete next[
                              feedbackMeeting.id
                            ]

                            return next
                          }
                        )
                      }}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        selectedFeedbackRating ===
                        'okay'
                          ? 'border-black bg-black text-white shadow-sm'
                          : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-white'
                      }`}
                    >
                      <div className="text-xl">
                        😐
                      </div>

                      <p className="mt-2 font-semibold">
                        Okay
                      </p>

                      <p
                        className={`mt-1 text-xs ${
                          selectedFeedbackRating ===
                          'okay'
                            ? 'text-white/60'
                            : 'text-gray-400'
                        }`}
                      >
                        It was fine
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFeedbackRatings(
                          (current) => ({
                            ...current,
                            [feedbackMeeting.id]:
                              'not_a_fit',
                          })
                        )

                        setSelectedMeetAgainAnswers(
                          (current) => {
                            const next = {
                              ...current,
                            }

                            delete next[
                              feedbackMeeting.id
                            ]

                            return next
                          }
                        )
                      }}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        selectedFeedbackRating ===
                        'not_a_fit'
                          ? 'border-black bg-black text-white shadow-sm'
                          : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-white'
                      }`}
                    >
                      <div className="text-xl">
                        👎
                      </div>

                      <p className="mt-2 font-semibold">
                        Not a fit
                      </p>

                      <p
                        className={`mt-1 text-xs ${
                          selectedFeedbackRating ===
                          'not_a_fit'
                            ? 'text-white/60'
                            : 'text-gray-400'
                        }`}
                      >
                        Not the right match
                      </p>
                    </button>

                  </div>

                  {selectedFeedbackRating && (

                    <div className="mt-7 border-t border-gray-100 pt-6">

                      <p className="text-sm font-semibold text-gray-900">
                        Would you meet again?
                      </p>

                      <p className="mt-1 text-xs text-gray-400">
                        Your answer is private and only used to improve Brework.
                      </p>

                      <div className="mt-4 grid grid-cols-3 gap-3">

                        <button
                          type="button"
                          onClick={() =>
                            setSelectedMeetAgainAnswers(
                              (current) => ({
                                ...current,
                                [feedbackMeeting.id]:
                                  'yes',
                              })
                            )
                          }
                          className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                            selectedMeetAgainAnswer ===
                            'yes'
                              ? 'border-black bg-black text-white'
                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          Yes
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setSelectedMeetAgainAnswers(
                              (current) => ({
                                ...current,
                                [feedbackMeeting.id]:
                                  'maybe',
                              })
                            )
                          }
                          className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                            selectedMeetAgainAnswer ===
                            'maybe'
                              ? 'border-black bg-black text-white'
                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          Maybe
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setSelectedMeetAgainAnswers(
                              (current) => ({
                                ...current,
                                [feedbackMeeting.id]:
                                  'no',
                              })
                            )
                          }
                          className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                            selectedMeetAgainAnswer ===
                            'no'
                              ? 'border-black bg-black text-white'
                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          No
                        </button>

                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          submitMeetingFeedback(
                            feedbackMeeting
                          )
                        }
                        disabled={
                          !selectedMeetAgainAnswer ||
                          submittingFeedback
                        }
                        className="mt-5 w-full rounded-2xl bg-black px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {submittingFeedback
                          ? 'Saving feedback...'
                          : 'Submit feedback'}
                      </button>

                    </div>

                  )}

                </>

              )}

            </div>

          </section>

        )}

        {/* UPCOMING COFFEE CHATS */}

        <section className="mb-8">

          <div className="mb-4 flex items-end justify-between">

            <div>

              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Your schedule
              </p>

              <h2 className="mt-1 text-2xl font-bold tracking-tight">
                Upcoming coffee chats
              </h2>

            </div>

            <button
              onClick={() =>
                router.push(
                  '/coffee-chats?view=calendar'
                )
              }
              className="text-sm font-semibold text-gray-500 transition hover:text-black"
            >
              View all →
            </button>

          </div>

          {upcomingMeetings.length ===
          0 ? (

            <div className="rounded-3xl border border-gray-200/70 bg-white p-7 shadow-sm">

              <div className="flex items-start gap-4">

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl">
                  ☕
                </div>

                <div>

                  <h3 className="font-semibold">
                    No upcoming coffee chats
                  </h3>

                  <p className="mt-1 text-sm leading-relaxed text-gray-500">
                    Connect with someone in Discover
                    and schedule a time to meet.
                  </p>

                  <button
                    onClick={() =>
                      router.push(
                        '/discover'
                      )
                    }
                    className="mt-4 text-sm font-bold transition hover:opacity-60"
                  >
                    Find someone →
                  </button>

                </div>

              </div>

            </div>

          ) : (

            <div className="space-y-3">

              {upcomingMeetings.map(
                (meeting) => (

                  <button
                    key={meeting.id}
                    onClick={() =>
                      router.push(
                        '/coffee-chats?view=calendar'
                      )
                    }
                    className="w-full rounded-2xl border border-gray-200/70 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >

                    <div className="flex items-center gap-4">

                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl">
                        ☕
                      </div>

                      <div className="min-w-0 flex-1">

                        <p className="font-semibold">
                          Coffee chat with{' '}
                          {getMeetingPartnerName(
                            meeting
                          )}
                        </p>

                        <p className="mt-1 text-sm text-gray-500">
                          {formatMeetingDate(
                            meeting.scheduled_date,
                            meeting.start_time,
                            meeting.end_time
                          )}
                        </p>

                        {meeting.location && (
                          <p className="mt-1 text-xs text-gray-400">
                            📍{' '}
                            {meeting.location}
                          </p>
                        )}

                      </div>

                      <span className="text-gray-400">
                        →
                      </span>

                    </div>

                  </button>

                )
              )}

            </div>

          )}

        </section>

        {/* RECOMMENDED FOR YOU */}

        <section className="mb-8">

          <div className="mb-4 flex items-end justify-between gap-4">

            <div>

              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Recommended for you
              </p>

              <h2 className="mt-1 text-2xl font-bold tracking-tight">
                People you may want to meet
              </h2>

              <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500">
                A few strong matches based on your major, career interests, and academic year.
              </p>

            </div>

            <button
              type="button"
              onClick={() =>
                router.push(
                  '/discover'
                )
              }
              className="shrink-0 text-sm font-semibold text-gray-500 transition hover:text-black"
            >
              See more →
            </button>

          </div>

          {recommendedProfiles.length ===
          0 ? (

            <button
              type="button"
              onClick={() =>
                router.push(
                  '/discover'
                )
              }
              className="w-full rounded-3xl border border-gray-200/70 bg-white p-7 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >

              <div className="flex items-start gap-4">

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl">
                  ✨
                </div>

                <div className="min-w-0 flex-1">

                  <h3 className="font-semibold">
                    Explore more people
                  </h3>

                  <p className="mt-1 text-sm leading-relaxed text-gray-500">
                    You&apos;re caught up on Dashboard recommendations. Open Discover to browse everyone currently available.
                  </p>

                  <p className="mt-4 text-sm font-bold">
                    Open Discover →
                  </p>

                </div>

              </div>

            </button>

          ) : (

            <div className="grid gap-3 md:grid-cols-3">

              {recommendedProfiles.map(
                (recommendedProfile) => {

                  const person =
                    recommendedProfile.profile

                  const name =
                    getRecommendedName(
                      recommendedProfile
                    )

                  const isConnecting =
                    connectingRecommendationId ===
                    person.id

                  return (

                    <div
                      key={person.id}
                      className="flex min-h-full flex-col rounded-3xl border border-gray-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div className="flex min-w-0 items-center gap-3">

                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">

                            {person.profile_photo_url ? (

                              <img
                                src={
                                  person.profile_photo_url
                                }
                                alt={`${name} profile`}
                                className="h-full w-full object-cover"
                              />

                            ) : (

                              <span className="text-sm font-bold text-gray-500">
                                {getRecommendedInitials(
                                  recommendedProfile
                                )}
                              </span>

                            )}

                          </div>

                          <div className="min-w-0">

                            <h3 className="truncate font-bold">
                              {name}
                            </h3>

                            {person.show_academic_info && (

                              <p className="mt-1 truncate text-xs text-gray-500">
                                {person.major ||
                                  'Major not listed'}

                                {person.academic_year
                                  ? ` • ${person.academic_year}`
                                  : ''}
                              </p>

                            )}

                          </div>

                        </div>

                        <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-600">
                          {getRecommendationMatchPercentage(
                            recommendedProfile.score
                          )}% match
                        </span>

                      </div>

                      {recommendedProfile.reasons.length >
                        0 && (

                        <div className="mt-4 flex flex-wrap gap-1.5">

                          {recommendedProfile.reasons
                            .slice(0, 2)
                            .map(
                              (reason) => (

                                <span
                                  key={reason}
                                  className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600"
                                >
                                  {reason}
                                </span>

                              )
                            )}

                        </div>

                      )}

                      {person.show_career_goal &&
                        person.career_goal && (

                        <p className="mt-4 line-clamp-2 text-xs leading-relaxed text-gray-500">
                          <span className="font-semibold text-gray-700">
                            Career:
                          </span>{' '}
                          {person.career_goal}
                        </p>

                      )}

                      <div className="mt-auto pt-5">

                        <button
                          type="button"
                          onClick={() =>
                            connectWithRecommendedProfile(
                              recommendedProfile
                            )
                          }
                          disabled={
                            connectingRecommendationId !==
                            null
                          }
                          className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isConnecting
                            ? 'Sending...'
                            : 'Connect'}
                        </button>

                      </div>

                    </div>

                  )
                }
              )}

            </div>

          )}

          <Link
            href="/discover"
            className="mt-4 block w-full rounded-2xl border border-gray-200 bg-white px-5 py-4 text-center text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Explore more matches in Discover →
          </Link>

        </section>

        {/* EXPLORE */}

        <section>

          <div className="mb-4">

            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              Explore Brework
            </p>

            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              What do you want to do?
            </h2>

          </div>

          <div className="grid gap-3 sm:grid-cols-2">

            <button
              onClick={() =>
                router.push(
                  '/connections'
                )
              }
              className="rounded-2xl border border-gray-200/70 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >

              <div className="flex items-center gap-4">

                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">
                  👥
                </div>

                <div>

                  <h3 className="font-semibold">
                    Connections
                  </h3>

                  <p className="mt-1 text-sm text-gray-500">
                    See your network and requests.
                  </p>

                </div>

              </div>

            </button>

            <button
              onClick={() =>
                router.push(
                  '/chats'
                )
              }
              className="rounded-2xl border border-gray-200/70 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >

              <div className="flex items-center gap-4">

                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">
                  💬
                </div>

                <div>

                  <h3 className="font-semibold">
                    Messages
                  </h3>

                  <p className="mt-1 text-sm text-gray-500">
                    Continue your conversations.
                  </p>

                </div>

              </div>

            </button>

            <button
              onClick={() =>
                router.push(
                  '/schedule'
                )
              }
              className="rounded-2xl border border-gray-200/70 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >

              <div className="flex items-center gap-4">

                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">
                  📅
                </div>

                <div>

                  <h3 className="font-semibold">
                    Schedule
                  </h3>

                  <p className="mt-1 text-sm text-gray-500">
                    Plan and manage coffee chats.
                  </p>

                </div>

              </div>

            </button>

            <button
              onClick={() =>
                router.push(
                  '/notifications'
                )
              }
              className="rounded-2xl border border-gray-200/70 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >

              <div className="flex items-center gap-4">

                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">
                  🔔
                </div>

                <div className="flex-1">

                  <div className="flex items-center gap-2">

                    <h3 className="font-semibold">
                      Notifications
                    </h3>

                    {unreadNotifications >
                      0 && (
                      <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-bold text-white">
                        {
                          unreadNotifications
                        }
                      </span>
                    )}

                  </div>

                  <p className="mt-1 text-sm text-gray-500">
                    Stay up to date with Brework.
                  </p>

                </div>

              </div>

            </button>

          </div>

        </section>

        {/* ERROR */}

        {error && (
          <div className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

      </div>

      {/* BOTTOM NAV */}

      <BottomNav />

    </main>
  )
}