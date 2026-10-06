'use client'

import { useEffect, useState } from 'react'

export default function PullToRefresh() {
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let startX = 0
    let startY = 0
    let pulling = false
    let currentDistance = 0
    let target: HTMLElement | null = null
    const threshold = 70

    function atTop(element: HTMLElement | null) {
      if (window.scrollY > 1 || (document.scrollingElement?.scrollTop ?? 0) > 1) return false
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowY
        if (/(auto|scroll)/.test(overflow) && node.scrollTop > 1) return false
      }
      return true
    }

    function reset() {
      pulling = false
      currentDistance = 0
      setDistance(0)
    }

    function start(event: TouchEvent) {
      reset()
      target = event.target instanceof HTMLElement ? event.target : null
      if (event.touches.length !== 1 || !atTop(target)) return
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"]')) return
      startX = event.touches[0].clientX
      startY = event.touches[0].clientY
      pulling = true
    }

    function move(event: TouchEvent) {
      if (!pulling) return
      if (event.touches.length !== 1 || !atTop(target)) { reset(); return }
      const dx = event.touches[0].clientX - startX
      const dy = event.touches[0].clientY - startY
      if (dy < 0 || Math.abs(dx) > Math.abs(dy)) { reset(); return }
      if (dy < 10) return
      // Take over only a vertical downward gesture, preserving ordinary scrolling.
      if (!event.cancelable) { reset(); return }
      event.preventDefault()
      currentDistance = Math.min(100, (dy - 10) * 0.5)
      setDistance(currentDistance)
    }

    function end() {
      if (pulling && currentDistance >= threshold) {
        pulling = false
        setRefreshing(true)
        setDistance(threshold)
        window.location.reload()
      } else reset()
    }

    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end, { passive: true })
    document.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', reset)
    }
  }, [])

  if (!distance && !refreshing) return null
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 z-[100] flex justify-center" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
      <div className="rounded-full px-4 py-3 text-sm font-semibold shadow-lg" style={{ backgroundColor: '#ffffff', color: '#111827', border: '1px solid #d1d5db' }}>
        {refreshing ? 'Refreshing…' : distance >= 70 ? 'Release to refresh' : 'Pull down to refresh'}
      </div>
    </div>
  )
}
