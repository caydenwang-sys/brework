'use client'

import { FormEvent, useRef, useState } from 'react'
import Link from 'next/link'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const lock = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true
    setLoading(true)
    setError('')
    setSent(false)
    try {
      // Native email links open the public website, not capacitor://localhost.
      const origin = Capacitor.isNativePlatform()
        ? 'https://brewlink-blush.vercel.app' : window.location.origin
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/reset-password`,
      })
      if (error) throw error
      setSent(true)
    } catch (cause) {
      const message = cause && typeof cause === 'object' && 'message' in cause
        ? String(cause.message) : 'Please check your connection and try again.'
      setError(message)
    } finally {
      lock.current = false
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-3xl font-bold">Brework</Link>
          <h1 className="mt-8 text-3xl font-bold">Forgot password?</h1>
          <p className="mt-3 text-gray-600">Enter your email and we’ll send you a link to reset your password.</p>
        </div>
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-900">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email}
              onChange={event => setEmail(event.target.value)} placeholder="you@example.com"
              disabled={loading}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-black focus:ring-2 focus:ring-gray-200" />
          </div>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
          {sent && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">
            If an account exists for that email, you’ll receive a reset link. Check your inbox and spam folder. Open the newest email link.
          </p>}
          <button type="submit" disabled={loading || sent}
            className="w-full rounded-xl bg-black px-4 py-3 font-semibold text-white disabled:opacity-50">
            {loading ? 'Sending…' : sent ? 'Check your email' : 'Send reset email'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm"><Link href="/login" className="font-semibold underline">Back to sign in</Link></p>
      </div>
    </main>
  )
}
