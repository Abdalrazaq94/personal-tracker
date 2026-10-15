import { useEffect, useRef } from 'react'

/**
 * Phone back button closes whatever is open (a sheet, the menu, the city picker…) instead of leaving the page.
 * While `open` is true we add one step to the browser history; pressing back removes it and calls `close`.
 * If it is closed another way (× button), we quietly take that step back out again.
 */
export function useBackToClose(open, close) {
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    if (!open) return
    const id = Math.random().toString(36).slice(2)
    window.history.pushState({ ...(window.history.state || {}), overlay: id }, '')
    let byBack = false
    const onPop = () => {
      byBack = true
      closeRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // closed with ×: remove our history step (only if we are still on it, not after moving to another page)
      if (!byBack && window.history.state?.overlay === id) window.history.back()
    }
  }, [open])
}
