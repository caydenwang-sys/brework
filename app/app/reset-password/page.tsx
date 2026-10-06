'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)

  useEffect(() => {
    let active = true
    const query = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))
    if (query.has('error') || hash.has('error')) {
      setError('This reset link is invalid or expired. Request a new reset email below.')
      setChecking(false)
      return
    }
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true)
        setChecking(false)
        setError('')
      }
      if (event === 'SIGNED_OUT') setReady(false)
    })
    async function check() {
      try {
        // getUser waits for the client to process the email link's auth session.
        const { data: { user }, error } = await supabase.auth.getUser()
        if (!active) return
        setReady(Boolean(user) && !error)
        if (!user || error) setError('Open the newest password reset email link. If it expired, request a new one below.')
      } catch {
        if (active) setError('Could not check your reset link. Please check your connection and reload this page.')
      } finally {
        if (active) setChecking(false)
      }
    }
    void check()
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready || lock.current) return
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirmation) { setError('Passwords do not match.'); return }
    lock.current = true
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setPassword('')
      setConfirmation('')
      setDone(true)
      setReady(false)
      // End the reset session in this browser. The user signs in with the new password.
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) console.error('Could not end reset session:', signOutError)
    } catch (cause) {
      const message = cause && typeof cause === 'object' && 'message' in cause
        ? String(cause.message) : 'Please check your connection and try again.'
      setError(message)
    } finally { lock.current = false; setSaving(false) }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-3xl font-bold">Brework</Link>
          <h1 className="mt-8 text-3xl font-bold">Choose a new password</h1>
        </div>
        {checking ? <p role="status" className="text-center text-gray-600">Checking your reset link…</p> : done ? (
          <div className="text-center">
            <p role="status" className="rounded-xl bg-green-50 p-4 text-green-700">Password updated. Sign in to Brework using your new password.</p>
            <Link href="/login" className="mt-6 inline-block rounded-xl bg-black px-6 py-3 font-semibold text-white">Sign in</Link>
          </div>
        ) : (
          <>
            {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
            {ready && <form onSubmit={submit} className="space-y-5">
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium">New password</label>
                <input id="password" type="password" autoComplete="new-password" required minLength={6}
                  value={password} onChange={event => setPassword(event.target.value)} disabled={saving}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-black" />
              </div>
              <div>
                <label htmlFor="confirmation" className="mb-2 block text-sm font-medium">Confirm new password</label>
                <input id="confirmation" type="password" autoComplete="new-password" required minLength={6}
                  value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={saving}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-black" />
              </div>
              <button type="submit" disabled={saving} className="w-full rounded-xl bg-black px-4 py-3 font-semibold text-white disabled:opacity-50">
                {saving ? 'Updating…' : 'Update password'}
              </button>
            </form>}
            <p className="mt-6 text-center text-sm"><Link href="/forgot-password" className="font-semibold underline">Request a new reset email</Link></p>
          </>
        )}
      </div>
    </main>
  )
}
