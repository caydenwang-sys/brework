'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Availability = {
  id: number
  user_id: string
  day_of_week: number
  start_time: string
  end_time: string
}

const days = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]

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

export default function AvailabilityPage() {
  const router = useRouter()

  const [availability, setAvailability] = useState<Availability[]>([])

  const [selectedDay, setSelectedDay] = useState(1)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')

  // ID of the availability window currently being edited.
  // null means we are adding a new window.
  const [editingId, setEditingId] = useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ============================================
  // LOAD AVAILABILITY
  // ============================================

  useEffect(() => {
    async function loadAvailability() {
      const supabase = createClient()

      setLoading(true)
      setError('')

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
        error: availabilityError,
      } = await supabase
        .from('availability')
        .select(`
          id,
          user_id,
          day_of_week,
          start_time,
          end_time
        `)
        .eq('user_id', user.id)
        .order('day_of_week', {
          ascending: true,
        })
        .order('start_time', {
          ascending: true,
        })

      if (availabilityError) {
        console.error(
          'Could not load availability:',
          availabilityError
        )

        setError('Could not load your availability.')
        setLoading(false)
        return
      }

      setAvailability((data || []) as Availability[])
      setLoading(false)
    }

    loadAvailability()
  }, [router])

  // ============================================
  // START EDITING
  // ============================================

  function startEditing(item: Availability) {
    setEditingId(item.id)
    setSelectedDay(item.day_of_week)

    // Supabase TIME values usually come back as HH:MM:SS.
    // The input[type="time"] needs HH:MM.
    setStartTime(item.start_time.slice(0, 5))
    setEndTime(item.end_time.slice(0, 5))

    setError('')
    setSuccess('')

    // Scroll back to the form on smaller screens.
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  // ============================================
  // CANCEL EDITING
  // ============================================

  function cancelEditing() {
    setEditingId(null)

    setSelectedDay(1)
    setStartTime('09:00')
    setEndTime('10:00')

    setError('')
    setSuccess('')
  }

  // ============================================
  // SAVE AVAILABILITY
  // ============================================

  async function saveAvailability() {
    if (saving) {
      return
    }

    setError('')
    setSuccess('')

    const startMinutes = timeToMinutes(startTime)
    const endMinutes = timeToMinutes(endTime)

    // ==========================================
    // VALIDATE TIME ORDER
    // ==========================================

    if (endMinutes <= startMinutes) {
      setError(
        'End time must be later than start time.'
      )
      return
    }

    // ==========================================
    // REQUIRE AT LEAST ONE HOUR
    // ==========================================

    if (endMinutes - startMinutes < 60) {
      setError(
        'Availability must be at least one hour long.'
      )
      return
    }

    // ==========================================
    // CHECK FOR OVERLAPPING AVAILABILITY
    // ==========================================

    const overlapping = availability.some((item) => {
      // When editing, ignore the current window.
      if (
        editingId !== null &&
        item.id === editingId
      ) {
        return false
      }

      // Only compare availability on the same day.
      if (item.day_of_week !== selectedDay) {
        return false
      }

      const existingStart = timeToMinutes(
        item.start_time
      )

      const existingEnd = timeToMinutes(
        item.end_time
      )

      return (
        startMinutes < existingEnd &&
        existingStart < endMinutes
      )
    })

    if (overlapping) {
      setError(
        'This time overlaps with an existing availability window.'
      )
      return
    }

    const supabase = createClient()

    setSaving(true)

    // ==========================================
    // GET CURRENT USER
    // ==========================================

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      router.push('/login')
      setSaving(false)
      return
    }

    // ==========================================
    // EDIT EXISTING AVAILABILITY
    // ==========================================

    if (editingId !== null) {
      const {
        data: updatedAvailability,
        error: updateError,
      } = await supabase
        .from('availability')
        .update({
          day_of_week: selectedDay,
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
        })
        .eq('id', editingId)
        .eq('user_id', user.id)
        .select(`
          id,
          user_id,
          day_of_week,
          start_time,
          end_time
        `)
        .single()

      if (updateError) {
        console.error(
          'Could not update availability:',
          updateError
        )

        setError(
          'Could not update your availability. Please try again.'
        )

        setSaving(false)
        return
      }

      // Replace the old availability window
      // with the updated version.
      setAvailability((current) =>
        current
          .map((item) =>
            item.id === editingId
              ? (updatedAvailability as Availability)
              : item
          )
          .sort((a, b) => {
            if (a.day_of_week !== b.day_of_week) {
              return a.day_of_week - b.day_of_week
            }

            return (
              timeToMinutes(a.start_time) -
              timeToMinutes(b.start_time)
            )
          })
      )

      setSuccess('Availability updated.')

      // Exit edit mode.
      setEditingId(null)

      setSelectedDay(1)
      setStartTime('09:00')
      setEndTime('10:00')

      setSaving(false)

      return
    }

    // ==========================================
    // ADD NEW AVAILABILITY
    // ==========================================

    const {
      data: newAvailability,
      error: insertError,
    } = await supabase
      .from('availability')
      .insert({
        user_id: user.id,
        day_of_week: selectedDay,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
      })
      .select(`
        id,
        user_id,
        day_of_week,
        start_time,
        end_time
      `)
      .single()

    if (insertError) {
      console.error(
        'Could not add availability:',
        insertError
      )

      setError(
        'Could not save your availability. Please try again.'
      )

      setSaving(false)
      return
    }

    setAvailability((current) =>
      [...current, newAvailability as Availability].sort(
        (a, b) => {
          if (a.day_of_week !== b.day_of_week) {
            return a.day_of_week - b.day_of_week
          }

          return (
            timeToMinutes(a.start_time) -
            timeToMinutes(b.start_time)
          )
        }
      )
    )

    setSuccess('Availability added.')

    setSaving(false)
  }

  // ============================================
  // DELETE AVAILABILITY
  // ============================================

  async function deleteAvailability(id: number) {
    if (deletingId !== null) {
      return
    }

    setError('')
    setSuccess('')

    const supabase = createClient()

    setDeletingId(id)

    const {
      error: deleteError,
    } = await supabase
      .from('availability')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error(
        'Could not delete availability:',
        deleteError
      )

      setError(
        'Could not delete this availability. Please try again.'
      )

      setDeletingId(null)
      return
    }

    // If the deleted item was being edited,
    // exit edit mode.
    if (editingId === id) {
      cancelEditing()
    }

    setAvailability((current) =>
      current.filter((item) => item.id !== id)
    )

    setSuccess('Availability removed.')

    setDeletingId(null)
  }

  // ============================================
  // GET DAY NAME
  // ============================================

  function getDayName(day: number) {
    return (
      days.find((item) => item.value === day)?.label ||
      'Unknown day'
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
            Loading your availability...
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
              router.push('/settings')
            }
            className="rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-black"
          >
            Back
          </button>

        </div>

      </header>

      {/* MAIN */}

      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-12">

        {/* TITLE */}

        <section className="mb-10">

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
            Brework
          </p>

          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            Your availability.
          </h1>

          <p className="mt-3 max-w-xl text-base leading-relaxed text-gray-500">
            Add the times you're usually available
            for coffee chats. Brework will use these
            times to find matches that work for both
            people.
          </p>

        </section>

        {/* ERROR */}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* SUCCESS */}

        {success && (
          <div className="mb-6 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-700">
            {success}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">

          {/* ADD / EDIT AVAILABILITY */}

          <section className="rounded-3xl border border-gray-200/70 bg-white p-6 shadow-sm">

            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              {editingId !== null
                ? 'Edit availability'
                : 'Add availability'}
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              {editingId !== null
                ? 'Change your schedule.'
                : 'When are you free?'}
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              {editingId !== null
                ? 'Update the day or time for this availability window.'
                : 'Add a window of at least one hour.'}
            </p>

            {/* DAY */}

            <div className="mt-6">

              <label className="text-sm font-semibold text-gray-700">
                Day
              </label>

              <select
                value={selectedDay}
                onChange={(e) =>
                  setSelectedDay(
                    Number(e.target.value)
                  )
                }
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-black focus:bg-white"
              >
                {days.map((day) => (
                  <option
                    key={day.value}
                    value={day.value}
                  >
                    {day.label}
                  </option>
                ))}
              </select>

            </div>

            {/* TIMES */}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">

              <div>

                <label className="text-sm font-semibold text-gray-700">
                  Start
                </label>

                <input
                  type="time"
                  value={startTime}
                  onChange={(e) =>
                    setStartTime(e.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-black focus:bg-white"
                />

              </div>

              <div>

                <label className="text-sm font-semibold text-gray-700">
                  End
                </label>

                <input
                  type="time"
                  value={endTime}
                  onChange={(e) =>
                    setEndTime(e.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-black focus:bg-white"
                />

              </div>

            </div>

            {/* SAVE BUTTON */}

            <button
              type="button"
              onClick={saveAvailability}
              disabled={saving}
              className="mt-6 w-full rounded-2xl bg-black px-5 py-4 text-sm font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? editingId !== null
                  ? 'Saving...'
                  : 'Adding...'
                : editingId !== null
                  ? 'Save changes →'
                  : 'Add availability →'}
            </button>

            {/* CANCEL EDIT */}

            {editingId !== null && (
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="mt-3 w-full rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            )}

          </section>

          {/* CURRENT AVAILABILITY */}

          <section className="rounded-3xl border border-gray-200/70 bg-white p-6 shadow-sm">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Your schedule
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  Current availability
                </h2>

              </div>

              <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
                {availability.length}{' '}
                {availability.length === 1
                  ? 'window'
                  : 'windows'}
              </div>

            </div>

            {availability.length === 0 ? (

              <div className="mt-6 rounded-2xl bg-gray-50 p-6 text-center">

                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl shadow-sm">
                  🕐
                </div>

                <h3 className="mt-4 font-semibold">
                  No availability yet
                </h3>

                <p className="mt-1 text-sm leading-relaxed text-gray-500">
                  Add your first availability window
                  using the form.
                </p>

              </div>

            ) : (

              <div className="mt-6 space-y-3">

                {availability.map((item) => (

                  <div
                    key={item.id}
                    className={`flex items-center justify-between rounded-2xl border p-4 transition ${
                      editingId === item.id
                        ? 'border-black bg-white shadow-sm'
                        : 'border-gray-200/70 bg-gray-50'
                    }`}
                  >

                    <div>

                      <p className="font-semibold">
                        {getDayName(
                          item.day_of_week
                        )}
                      </p>

                      <p className="mt-1 text-sm text-gray-500">
                        {formatTime(
                          item.start_time
                        )}
                        {' – '}
                        {formatTime(
                          item.end_time
                        )}
                      </p>

                    </div>

                    <div className="flex items-center gap-2">

                      {/* EDIT */}

                      <button
                        type="button"
                        onClick={() =>
                          startEditing(item)
                        }
                        disabled={
                          saving ||
                          deletingId !== null
                        }
                        className="rounded-xl px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Edit
                      </button>

                      {/* REMOVE */}

                      <button
                        type="button"
                        onClick={() =>
                          deleteAvailability(
                            item.id
                          )
                        }
                        disabled={
                          deletingId === item.id ||
                          saving
                        }
                        className="rounded-xl px-3 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingId === item.id
                          ? 'Removing...'
                          : 'Remove'}
                      </button>

                    </div>

                  </div>

                ))}

              </div>

            )}

          </section>

        </div>

        {/* BACK TO SCHEDULE */}

        <div className="mt-8 text-center">

          <button
            type="button"
            onClick={() =>
              router.push('/schedule')
            }
            className="text-sm font-semibold text-gray-500 transition hover:text-black"
          >
            ← Back to scheduling
          </button>

        </div>

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