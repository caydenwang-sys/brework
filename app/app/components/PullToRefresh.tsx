'use client'

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export default function PullToRefresh({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [version, setVersion] = useState(0)
  const busy = useRef(false)

  useEffect(() => {
    let startX = 0
    let startY = 0
    let pulling = false
    let currentDistance = 0
    let target: HTMLElement | null = null
    let frame = 0
    let settle: ReturnType<typeof setTimeout> | undefined
    const threshold = 60
    busy.current = false
    setRefreshing(false)
    setDistance(0)

    function atTop(element: HTMLElement | null) {
      if (window.scrollY > 1 || (document.scrollingElement?.scrollTop ?? 0) > 1) return false
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollTop > 1) return false
      }
      return true
    }
    function reset() {
      pulling = false
      currentDistance = 0
      cancelAnimationFrame(frame)
      setDistance(0)
    }
    function start(event: TouchEvent) {
      if (busy.current) return
      reset()
      target = event.target instanceof HTMLElement ? event.target : null
      if (event.touches.length !== 1 || !atTop(target)) return
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"]')) return
      if (document.activeElement instanceof HTMLElement && document.activeElement.matches('input, textarea, [contenteditable="true"]')) return
      startX = event.touches[0].clientX
      startY = event.touches[0].clientY
      pulling = true
    }
    function move(event: TouchEvent) {
      if (!pulling || busy.current) return
      if (event.touches.length !== 1 || !atTop(target)) { reset(); return }
      const dx = event.touches[0].clientX - startX
      const dy = event.touches[0].clientY - startY
      if (dy < 0 || Math.abs(dx) > Math.abs(dy)) { reset(); return }
      if (dy < 12) return
      if (!event.cancelable) { reset(); return }
      event.preventDefault()
      currentDistance = Math.min(84, (dy - 12) * 0.45)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setDistance(currentDistance))
    }
    function end() {
      if (!pulling || currentDistance < threshold) { reset(); return }
      pulling = false
      cancelAnimationFrame(frame)
      busy.current = true
      setDistance(threshold)
      setRefreshing(true)
      // Remount page components to rerun their Supabase loaders. No document
      // reload, native startup redirect, or change to pathname/query/hash.
      setVersion(current => current + 1)
      // Gesture feedback settles independently of each page's loading/error UI.
      settle = setTimeout(() => {
        busy.current = false
        setRefreshing(false)
        setDistance(0)
      }, 650)
    }
    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end, { passive: true })
    document.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      if (settle) clearTimeout(settle)
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', reset)
    }
  }, [pathname])

  return (
    <>
      <Fragment key={`${pathname}:${version}`}>{children}</Fragment>
      <div role="status" aria-label={refreshing ? 'Refreshing page' : 'Pull to refresh'}
        aria-hidden={!distance && !refreshing}
        className="pointer-events-none fixed inset-x-0 z-[100] flex justify-center"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)', opacity: distance || refreshing ? 1 : 0,
          transform: `translateY(${distance ? Math.min(distance * 0.4, 24) : -48}px)`,
          transition: 'transform 180ms ease-out, opacity 180ms ease-out' }}>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-md">
          <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 text-gray-700 ${refreshing ? 'animate-spin' : ''}`}
            style={{ transform: refreshing ? undefined : `rotate(${distance * 4}deg)` }}>
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
            <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </>
  )
}
