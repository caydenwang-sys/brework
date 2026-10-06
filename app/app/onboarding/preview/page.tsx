'use client'

import {
  useEffect,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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

type MatchPreferences = {
  user_id: string
  same_major: boolean
  similar_career_interests: boolean
  outside_major: boolean
  upperclassmen: boolean
  mentors: boolean
  project_collaborators: boolean
  frequency: string
  match_style: string
}

type AvailabilitySlot = {
  id: number
  user_id: string
  day_of_week: number
  start_time: string
  end_time: string
}

const onboardingSteps = [
  { number: 1, title: 'Basic info', shortTitle: 'Basics' },
  { number: 2, title: 'Academic', shortTitle: 'Academic' },
  { number: 3, title: 'Career & about', shortTitle: 'Career' },
  { number: 4, title: 'Interests', shortTitle: 'Interests' },
  { number: 5, title: 'Clubs & organizations', shortTitle: 'Clubs' },
  { number: 6, title: 'Work experience', shortTitle: 'Work' },
  { number: 7, title: 'Projects', shortTitle: 'Projects' },
  { number: 8, title: 'Matching preferences', shortTitle: 'Matching' },
  { number: 9, title: 'Availability', shortTitle: 'Availability' },
  { number: 10, title: 'Privacy', shortTitle: 'Privacy' },
  { number: 11, title: 'Preview', shortTitle: 'Preview' },
]

export default function PreviewOnboardingPage() {
  const router = useRouter()

  const [profile, setProfile] =
    useState<Profile | null>(null)

  const [interests, setInterests] =
    useState<Interest[]>([])

  const [clubs, setClubs] =
    useState<Club[]>([])

  const [
    workExperiences,
    setWorkExperiences,
  ] =
    useState<WorkExperience[]>([])

  const [projects, setProjects] =
    useState<Project[]>([])

  const [
    preferences,
    setPreferences,
  ] =
    useState<MatchPreferences | null>(
      null
    )

  const [
    availability,
    setAvailability,
  ] =
    useState<AvailabilitySlot[]>([])

  const [loading, setLoading] =
    useState(true)

  const [finishing, setFinishing] =
    useState(false)

  const [error, setError] =
    useState('')

  const currentStep = 11

  const progress =
    Math.round(
      (
        currentStep /
        onboardingSteps.length
      ) * 100
    )

  useEffect(() => {
    async function loadPreview() {
      const supabase =
        createClient()

      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser()

      if (
        userError ||
        !user
      ) {
        setError(
          'You must be logged in to continue.'
        )
        setLoading(false)
        return
      }

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
            academic_year,
            bio,
            career_goal,
            profile_photo_url,
            is_discoverable,
            show_academic_info,
            show_career_goal
          `)
          .eq(
            'id',
            user.id
          )
          .single()

      if (profileError) {
        setError(
          `Could not load profile: ${profileError.message}`
        )
        setLoading(false)
        return
      }

      const {
        data: interestLinks,
        error: interestLinkError,
      } =
        await supabase
          .from('user_interests')
          .select(`
            interest_id
          `)
          .eq(
            'user_id',
            user.id
          )

      if (interestLinkError) {
        setError(
          `Could not load interests: ${interestLinkError.message}`
        )
        setLoading(false)
        return
      }

      const interestIds =
        (
          interestLinks ||
          []
        ).map(
          (row) =>
            row.interest_id
        )

      let loadedInterests:
        Interest[] = []

      if (
        interestIds.length > 0
      ) {
        const {
          data: interestData,
          error: interestError,
        } =
          await supabase
            .from('interests')
            .select(`
              id,
              name,
              category
            `)
            .in(
              'id',
              interestIds
            )
            .order(
              'name',
              {
                ascending: true,
              }
            )

        if (interestError) {
          setError(
            `Could not load interests: ${interestError.message}`
          )
          setLoading(false)
          return
        }

        loadedInterests =
          (interestData ||
            []) as Interest[]
      }

      const {
        data: clubLinks,
        error: clubLinkError,
      } =
        await supabase
          .from('user_clubs')
          .select(`
            club_id
          `)
          .eq(
            'user_id',
            user.id
          )

      if (clubLinkError) {
        setError(
          `Could not load clubs: ${clubLinkError.message}`
        )
        setLoading(false)
        return
      }

      const clubIds =
        (
          clubLinks ||
          []
        ).map(
          (row) =>
            row.club_id
        )

      let loadedClubs:
        Club[] = []

      if (
        clubIds.length > 0
      ) {
        const {
          data: clubData,
          error: clubError,
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
            .order(
              'name',
              {
                ascending: true,
              }
            )

        if (clubError) {
          setError(
            `Could not load clubs: ${clubError.message}`
          )
          setLoading(false)
          return
        }

        loadedClubs =
          (clubData ||
            []) as Club[]
      }

      const {
        data: workData,
        error: workError,
      } =
        await supabase
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
          .eq(
            'user_id',
            user.id
          )
          .order(
            'start_date',
            {
              ascending: false,
            }
          )

      if (workError) {
        setError(
          `Could not load work experience: ${workError.message}`
        )
        setLoading(false)
        return
      }

      const {
        data: projectData,
        error: projectError,
      } =
        await supabase
          .from('projects')
          .select(`
            id,
            user_id,
            title,
            description
          `)
          .eq(
            'user_id',
            user.id
          )
          .order(
            'created_at',
            {
              ascending: false,
            }
          )

      if (projectError) {
        setError(
          `Could not load projects: ${projectError.message}`
        )
        setLoading(false)
        return
      }

      const {
        data: preferencesData,
        error: preferencesError,
      } =
        await supabase
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
          .maybeSingle()

      if (preferencesError) {
        setError(
          `Could not load matching preferences: ${preferencesError.message}`
        )
        setLoading(false)
        return
      }

      const {
        data: availabilityData,
        error: availabilityError,
      } =
        await supabase
          .from('availability')
          .select(`
            id,
            user_id,
            day_of_week,
            start_time,
            end_time
          `)
          .eq(
            'user_id',
            user.id
          )
          .order(
            'day_of_week',
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

      if (availabilityError) {
        setError(
          `Could not load availability: ${availabilityError.message}`
        )
        setLoading(false)
        return
      }

      setProfile(
        profileData as Profile
      )

      setInterests(
        loadedInterests
      )

      setClubs(
        loadedClubs
      )

      setWorkExperiences(
        (workData ||
          []) as WorkExperience[]
      )

      setProjects(
        (projectData ||
          []) as Project[]
      )

      setPreferences(
        preferencesData as MatchPreferences | null
      )

      setAvailability(
        (availabilityData ||
          []) as AvailabilitySlot[]
      )

      setLoading(false)
    }

    loadPreview()
  }, [])

  function formatWorkDate(
    value:
      | string
      | null
  ) {
    if (!value) {
      return ''
    }

    return new Date(
      `${value}T00:00:00`
    ).toLocaleDateString(
      [],
      {
        month: 'short',
        year: 'numeric',
      }
    )
  }

  function formatTime(
    value: string
  ) {
    const [
      rawHour,
      rawMinute,
    ] =
      value.split(':')

    const hour =
      Number(rawHour)

    const minute =
      rawMinute ||
      '00'

    if (
      Number.isNaN(hour)
    ) {
      return value
    }

    const period =
      hour >= 12
        ? 'PM'
        : 'AM'

    const displayHour =
      hour % 12 || 12

    return `${displayHour}:${minute} ${period}`
  }

  function dayLabel(
    value: number
  ) {
    return [
      '',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ][value] || `Day ${value}`
  }

  async function finishOnboarding() {
    if (finishing) {
      return
    }

    setFinishing(true)
    setError('')

    const supabase =
      createClient()

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser()

    if (
      userError ||
      !user
    ) {
      setError(
        'You must be logged in to finish onboarding.'
      )
      setFinishing(false)
      return
    }

    const {
      data: requiredProfile,
      error:
        requiredProfileError,
    } =
      await supabase
        .from('profiles')
        .select(`
          first_name,
          last_name,
          major,
          academic_year
        `)
        .eq(
          'id',
          user.id
        )
        .single()

    if (
      requiredProfileError
    ) {
      setError(
        `Could not verify your profile: ${requiredProfileError.message}`
      )
      setFinishing(false)
      return
    }

    if (
      !requiredProfile.first_name?.trim() ||
      !requiredProfile.last_name?.trim() ||
      !requiredProfile.major?.trim() ||
      !requiredProfile.academic_year
    ) {
      setError(
        'Your name, major, and academic year must be completed before finishing onboarding.'
      )
      setFinishing(false)
      return
    }

    const { error: completionError } = await supabase
      .from('profiles')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('id')
      .single()

    if (completionError) {
      setError(`Could not finish onboarding: ${completionError.message}`)
      setFinishing(false)
      return
    }

    router.push(
      '/dashboard'
    )
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">

        <div className="text-center">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
            👀
          </div>

          <p className="mt-4 text-sm font-medium text-gray-500">
            Building your profile preview...
          </p>

        </div>

      </main>
    )
  }

  const displayName =
    `${profile?.first_name || ''} ${profile?.last_name || ''}`
      .trim() ||
    'Your Name'

  return (
    <main className="min-h-screen bg-[#f7f7f5]">

      {/* HEADER */}

      <header className="border-b border-gray-200/70 bg-white">

        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-6">

          <button
            type="button"
            onClick={() =>
              router.push(
                '/onboarding/privacy'
              )
            }
            className="text-xl font-bold tracking-tight transition hover:opacity-70"
          >
            Brework
          </button>

          <span className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white">
            Step {currentStep} of{' '}
            {onboardingSteps.length}
          </span>

        </div>

      </header>

      {/* PROGRESS */}

      <div className="border-b border-gray-200/70 bg-white">

        <div className="mx-auto max-w-5xl px-5 pb-4 sm:px-6">

          <div className="h-2 overflow-hidden rounded-full bg-gray-100">

            <div
              className="h-full rounded-full bg-black transition-all"
              style={{
                width:
                  `${progress}%`,
              }}
            />

          </div>

          <div className="mt-3 hidden grid-cols-11 gap-1 lg:grid">

            {onboardingSteps.map(
              (step) => (

                <div
                  key={
                    step.number
                  }
                  className="text-center"
                >

                  <div
                    className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                      step.number ===
                      currentStep
                        ? 'bg-black text-white'
                        : step.number <
                          currentStep
                          ? 'bg-gray-300 text-white'
                          : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {step.number}
                  </div>

                  <p
                    className={`mt-1 truncate text-[10px] font-medium ${
                      step.number ===
                      currentStep
                        ? 'text-black'
                        : 'text-gray-400'
                    }`}
                  >
                    {step.shortTitle}
                  </p>

                </div>

              )
            )}

          </div>

        </div>

      </div>

      {/* CONTENT */}

      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-12">

        <section className="mb-8">

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
            You&apos;re almost done
          </p>

          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            Preview your Brework profile
          </h1>

          <p className="mt-3 max-w-2xl text-base leading-relaxed text-gray-500">
            Review the profile you&apos;ve built. You can go back to make changes now,
            or finish onboarding and edit anything later from your Profile page.
          </p>

        </section>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* PUBLIC PROFILE PREVIEW */}

        <section className="overflow-hidden rounded-[2rem] border border-gray-200/70 bg-white shadow-sm">

          <div className="border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white p-6 sm:p-8">

            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">

              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">

                {profile?.profile_photo_url ? (

                  <img
                    src={
                      profile.profile_photo_url
                    }
                    alt={`${displayName} profile`}
                    className="h-full w-full object-cover"
                  />

                ) : (

                  <span className="text-2xl font-bold text-gray-500">
                    {`${profile?.first_name?.charAt(0) || ''}${profile?.last_name?.charAt(0) || ''}`.toUpperCase() || '?'}
                  </span>

                )}

              </div>

              <div className="min-w-0 flex-1">

                <h2 className="break-words text-2xl font-bold tracking-tight">
                  {displayName}
                </h2>

                {profile?.show_academic_info && (
                  <p className="mt-1 break-words text-sm text-gray-500">
                    {profile.major ||
                      'Major not listed'}
                    {profile.academic_year
                      ? ` • ${profile.academic_year}`
                      : ''}
                  </p>
                )}

                {profile?.show_career_goal &&
                  profile.career_goal && (
                  <p className="mt-2 break-words text-sm font-semibold text-gray-700">
                    {profile.career_goal}
                  </p>
                )}

                {profile &&
                  !profile.is_discoverable && (
                  <span className="mt-3 inline-flex rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">
                    Hidden from discovery
                  </span>
                )}

              </div>

            </div>

          </div>

          <div className="space-y-7 p-6 sm:p-8">

            {profile?.bio && (
              <div>

                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                  About
                </p>

                <p className="mt-2 break-words text-sm leading-relaxed text-gray-600">
                  {profile.bio}
                </p>

              </div>
            )}

            {interests.length > 0 && (
              <div>

                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                  Interests
                </p>

                <div className="mt-2 flex flex-wrap gap-2">

                  {interests.map(
                    (interest) => (
                      <span
                        key={interest.id}
                        className="max-w-full break-words rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600"
                      >
                        {interest.name}
                      </span>
                    )
                  )}

                </div>

              </div>
            )}

            {clubs.length > 0 && (
              <div>

                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                  Clubs & Organizations
                </p>

                <div className="mt-2 flex flex-wrap gap-2">

                  {clubs.map(
                    (club) => (
                      <span
                        key={club.id}
                        className="max-w-full break-words rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600"
                      >
                        {club.name}
                      </span>
                    )
                  )}

                </div>

              </div>
            )}

            {workExperiences.length > 0 && (
              <div>

                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                  Work Experience
                </p>

                <div className="mt-3 space-y-3">

                  {workExperiences.map(
                    (experience) => (
                      <div
                        key={experience.id}
                        className="rounded-2xl bg-gray-50 p-4"
                      >

                        <div className="flex flex-wrap items-start justify-between gap-2">

                          <div>

                            <p className="break-words text-sm font-bold text-gray-900">
                              {experience.role_title}
                            </p>

                            <p className="mt-1 break-words text-sm font-semibold text-gray-700">
                              {experience.company_name}
                            </p>

                          </div>

                          {experience.is_current && (
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                              Current
                            </span>
                          )}

                        </div>

                        <p className="mt-2 text-xs text-gray-400">
                          {experience.industry}
                          {' • '}
                          {formatWorkDate(
                            experience.start_date
                          )}
                          {' – '}
                          {experience.is_current
                            ? 'Present'
                            : formatWorkDate(
                                experience.end_date
                              )}
                        </p>

                        {experience.description && (
                          <p className="mt-2 break-words text-sm leading-relaxed text-gray-500">
                            {experience.description}
                          </p>
                        )}

                      </div>
                    )
                  )}

                </div>

              </div>
            )}

            {projects.length > 0 && (
              <div>

                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                  Projects
                </p>

                <div className="mt-3 space-y-3">

                  {projects.map(
                    (project) => (
                      <div
                        key={project.id}
                        className="rounded-2xl bg-gray-50 p-4"
                      >

                        <p className="break-words text-sm font-bold text-gray-900">
                          {project.title}
                        </p>

                        {project.description && (
                          <p className="mt-2 break-words text-sm leading-relaxed text-gray-500">
                            {project.description}
                          </p>
                        )}

                      </div>
                    )
                  )}

                </div>

              </div>
            )}

          </div>

        </section>

        {/* SETTINGS SUMMARY */}

        <section className="mt-5 rounded-[2rem] border border-gray-200/70 bg-white p-6 shadow-sm">

          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
            Setup summary
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">

            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-400">
                Interests
              </p>
              <p className="mt-1 text-sm font-bold text-gray-800">
                {interests.length}
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-400">
                Clubs
              </p>
              <p className="mt-1 text-sm font-bold text-gray-800">
                {clubs.length}
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-400">
                Work positions
              </p>
              <p className="mt-1 text-sm font-bold text-gray-800">
                {workExperiences.length}
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-400">
                Projects
              </p>
              <p className="mt-1 text-sm font-bold text-gray-800">
                {projects.length}
              </p>
            </div>

          </div>

          <div className="mt-4 rounded-2xl bg-gray-50 p-4">

            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
              Matching
            </p>

            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {preferences
                ? `Style: ${preferences.match_style}. Frequency: ${preferences.frequency}.`
                : 'No matching preferences saved yet.'}
            </p>

          </div>

          <div className="mt-4 rounded-2xl bg-gray-50 p-4">

            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
              Availability
            </p>

            {availability.length === 0 ? (

              <p className="mt-2 text-sm text-gray-500">
                No availability added yet.
              </p>

            ) : (

              <div className="mt-2 flex flex-wrap gap-2">

                {availability.slice(
                  0,
                  8
                ).map(
                  (slot) => (
                    <span
                      key={slot.id}
                      className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-600"
                    >
                      {dayLabel(
                        slot.day_of_week
                      )}
                      {' '}
                      {formatTime(
                        slot.start_time
                      )}
                      {'–'}
                      {formatTime(
                        slot.end_time
                      )}
                    </span>
                  )
                )}

                {availability.length >
                  8 && (
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
                    +{availability.length - 8} more
                  </span>
                )}

              </div>

            )}

          </div>

        </section>

        {/* ACTIONS */}

        <section className="mt-5 rounded-[2rem] border border-gray-200/70 bg-white p-6 shadow-sm">

          <div className="flex flex-col gap-3 sm:flex-row">

            <button
              type="button"
              onClick={() =>
                router.push(
                  '/onboarding/privacy'
                )
              }
              disabled={
                finishing
              }
              className="w-full rounded-xl border border-gray-200 bg-white px-5 py-4 font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 sm:w-auto"
            >
              Back
            </button>

            <button
              type="button"
              onClick={
                finishOnboarding
              }
              disabled={
                finishing
              }
              className="w-full flex-1 rounded-xl bg-black px-5 py-4 font-semibold text-white transition hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {finishing
                ? 'Finishing onboarding...'
                : 'Finish Onboarding'}
            </button>

          </div>

          <p className="mt-4 text-center text-xs leading-relaxed text-gray-400">
            You can edit every section later from your Brework Profile page.
          </p>

        </section>

      </div>

    </main>
  )
}