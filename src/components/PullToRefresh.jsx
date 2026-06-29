import { useState, useRef, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

const PULL_THRESHOLD = 68;   // px of pull needed to trigger refresh
const MAX_PULL       = 108;  // cap on indicator travel distance
const RESISTANCE     = 0.42; // rubber-band factor (lower = more resistance)

/**
 * PullToRefresh — real mobile pull-to-refresh for Android & iOS PWAs.
 *
 * Key design decisions:
 * - Attaches touch listeners to the sticky header (.app-header),
 *   allowing the refresh gesture to only trigger if pulling from the header.
 * - Uses overscrollBehaviorY: 'none' to kill Chrome/Android's built-in PTR.
 * - touchmove is registered NON-PASSIVE so e.preventDefault() can suppress
 *   iOS Safari's elastic bounce scroll during the pull gesture.
 * - pullY is mirrored in currentPullRef so the touchend closure always sees
 *   the latest value (avoids stale-closure bugs).
 */
export default function PullToRefresh({ onRefresh, children }) {
  const [pullY,        setPullY]        = useState(0);
  const [isDragging,   setIsDragging]   = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const containerRef   = useRef(null);
  const startYRef      = useRef(null);
  const currentPullRef = useRef(0); // always in sync with pullY for touchend closure

  // ── Refresh handler ──────────────────────────────────────────────────────
  const triggerRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setIsDragging(false);
    setPullY(PULL_THRESHOLD);
    currentPullRef.current = PULL_THRESHOLD;

    // Optional haptic feedback on supporting devices
    if ('vibrate' in navigator) navigator.vibrate(12);

    try {
      if (typeof onRefresh === 'function') {
        await onRefresh();
        await sleep(500); // brief pause so spinner stays visible
      } else {
        await sleep(750);
        window.location.reload(); // default: full page reload
        return; // component will unmount
      }
    } catch (_) { /* swallow */ }

    setIsRefreshing(false);
    setPullY(0);
    currentPullRef.current = 0;
  }, [onRefresh]);

  // ── Touch event registration on the .app-header ──────────────────────────
  useEffect(() => {
    // Find the sticky header element and the scroll container
    const headerEl = document.querySelector('.app-header');
    const scrollEl = containerRef.current;
    if (!headerEl || !scrollEl) return;

    const onTouchStart = (e) => {
      // Only start tracking when the container is flush at the very top
      startYRef.current = scrollEl.scrollTop <= 0 ? e.touches[0].clientY : null;
    };

    const onTouchMove = (e) => {
      if (startYRef.current === null || isRefreshing) return;

      // If user scrolled down between events, abort pull tracking
      if (scrollEl.scrollTop > 0) {
        startYRef.current = null;
        if (currentPullRef.current > 0) {
          setPullY(0);
          currentPullRef.current = 0;
          setIsDragging(false);
        }
        return;
      }

      const dy = e.touches[0].clientY - startYRef.current;

      if (dy <= 0) {
        // Swiping upward — cancel pull state
        if (currentPullRef.current > 0) {
          setPullY(0);
          currentPullRef.current = 0;
          setIsDragging(false);
        }
        return;
      }

      // Actively pulling down — block native overscroll / bounce
      e.preventDefault();

      const dist = Math.min(dy * RESISTANCE, MAX_PULL);
      currentPullRef.current = dist;
      setPullY(dist);
      setIsDragging(true);
    };

    const onTouchEnd = () => {
      const dist = currentPullRef.current;
      startYRef.current = null;

      if (dist === 0) { setIsDragging(false); return; }

      setIsDragging(false);

      if (dist >= PULL_THRESHOLD) {
        triggerRefresh();
      } else {
        setPullY(0);
        currentPullRef.current = 0;
      }
    };

    // touchmove MUST be { passive: false } so e.preventDefault() is allowed
    headerEl.addEventListener('touchstart', onTouchStart, { passive: true });
    headerEl.addEventListener('touchmove',  onTouchMove,  { passive: false });
    headerEl.addEventListener('touchend',   onTouchEnd,   { passive: true });

    return () => {
      headerEl.removeEventListener('touchstart', onTouchStart);
      headerEl.removeEventListener('touchmove',  onTouchMove);
      headerEl.removeEventListener('touchend',   onTouchEnd);
    };
  }, [isRefreshing, triggerRefresh]);

  // ── Derived display values ───────────────────────────────────────────────
  const progress      = Math.min(pullY / PULL_THRESHOLD, 1);
  const isReady       = pullY >= PULL_THRESHOLD && !isRefreshing;
  const useTransition = !isDragging; // animate only when finger is not down

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        /* Disables Chrome/Android native pull-to-refresh indicator */
        overscrollBehaviorY: 'none',
        /* Enables smooth momentum scrolling on iOS */
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
      }}
    >
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes ptr-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />

      {/* ── Indicator — starts hidden above viewport via negative margin ── */}
      <div
        aria-live="polite"
        style={{
          height:    `${PULL_THRESHOLD}px`,
          marginTop: `-${PULL_THRESHOLD}px`, // initially off-screen above
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '5px',
          pointerEvents: 'none',
          userSelect: 'none',
          transform: `translateY(${isRefreshing ? PULL_THRESHOLD : isDragging ? pullY : 0}px)`,
          transition: useTransition
            ? 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
            : 'none',
          willChange: 'transform',
        }}
      >
        {/* Circular badge with Blaze Orange theme matching colors */}
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary, #ff5900) 0%, var(--primary-hover, #cc4700) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 4px 18px rgba(255, 89, 0, ${(0.15 + 0.45 * progress).toFixed(2)})`,
            opacity: progress,
            transform: `scale(${(0.48 + 0.52 * progress).toFixed(3)})`,
            transition: useTransition ? 'opacity 0.2s ease, transform 0.2s ease' : 'none',
          }}
        >
          <RefreshCw
            size={20}
            color="#fff"
            style={{
              transform:  isRefreshing ? undefined : `rotate(${(progress * 300).toFixed(0)}deg)`,
              transition: isRefreshing ? undefined : 'transform 0.05s linear',
              animation:  isRefreshing ? 'ptr-spin 0.75s linear infinite' : 'none',
            }}
          />
        </div>

        {/* "Release to refresh" / "Refreshing…" label */}
        <span
          style={{
            fontSize: '0.58rem',
            fontWeight: 700,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            color: 'var(--primary, #ff5900)',
            opacity: progress >= 0.9 ? 1 : 0,
            transition: 'opacity 0.15s ease',
          }}
        >
          {isRefreshing ? 'Refreshing\u2026' : isReady ? 'Release to refresh' : 'Pull to refresh'}
        </span>
      </div>

      {/* ── Content — slides down as you pull ── */}
      <div
        style={{
          transform: `translateY(${isDragging ? pullY : 0}px)`,
          transition: useTransition
            ? 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
            : 'none',
          willChange: 'transform',
          minHeight: '100%',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
