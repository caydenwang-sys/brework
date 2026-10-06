'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function HomePage() {
  const router = useRouter()
  const [error, setError] = useState('')

  const [checkingSession, setCheckingSession] =
    useState(true)

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      const supabase = createClient()

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) {
        return
      }

      if (session) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('onboarding_completed_at')
          .eq('id', session.user.id)
          .maybeSingle()
        if (!mounted) return
        if (profileError) {
          setError('Could not check your account setup. Please try again.')
          return
        }
        router.replace(profile?.onboarding_completed_at ? '/dashboard' : '/onboarding')
        return
      }

      setCheckingSession(false)
    }

    checkSession()

    return () => {
      mounted = false
    }
  }, [router])

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        {error ? (
          <div className="px-6 text-center">
            <p role="alert" className="text-sm text-red-600">{error}</p>
            <button type="button" onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-black px-5 py-3 font-semibold text-white">
              Try again
            </button>
          </div>
        ) : (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
        )}
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white">

      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-5 md:px-12">
        <div className="text-2xl font-bold">
          Brework
        </div>

        <Link
          href="/login"
          className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:bg-gray-100"
        >
          Sign In
        </Link>
      </nav>

      {/* Hero Section */}
      <section className="flex min-h-[calc(100vh-80px)] items-center justify-center px-6">
        <div className="mx-auto max-w-3xl text-center">

          {/* Badge */}
          <div className="mb-6 inline-block rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
            Built for college students
          </div>

          {/* Main heading */}
          <h1 className="text-5xl font-bold tracking-tight md:text-7xl">
            Meet people who
            <br />
            <span className="text-gray-500">
              move you forward.
            </span>
          </h1>

          {/* Description */}
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600 md:text-xl">
            Brework helps you discover students who share your
            interests, career goals, projects, and ambitions.
          </p>

          {/* Buttons */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">

            <Link
              href="/signup"
              className="w-full rounded-xl bg-black px-8 py-4 text-center font-semibold text-white transition hover:opacity-90 sm:w-auto"
            >
              Get Started
            </Link>

            <Link
              href="/login"
              className="w-full rounded-xl border border-gray-300 px-8 py-4 text-center font-semibold text-gray-900 transition hover:bg-gray-50 sm:w-auto"
            >
              I already have an account
            </Link>

          </div>

          {/* Features */}
          <div className="mt-16 grid gap-6 text-left md:grid-cols-3">

            <div className="rounded-2xl border border-gray-200 p-6">
              <div className="mb-3 text-2xl">
                🤝
              </div>

              <h3 className="font-semibold">
                Find your people
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-600">
                Discover students with similar interests,
                majors, and career goals.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-6">
              <div className="mb-3 text-2xl">
                ☕
              </div>

              <h3 className="font-semibold">
                Make the connection
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-600">
                Turn an online connection into a real conversation.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-6">
              <div className="mb-3 text-2xl">
                🚀
              </div>

              <h3 className="font-semibold">
                Keep connecting
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-600">
                Build a habit of meeting new people throughout college.
              </p>
            </div>

          </div>

        </div>
      </section>

    </main>
  )
}