/**
 * A7Box Skeleton Components
 * Loading placeholder components for lazy-loaded modules
 */

/** Page-level skeleton with sidebar-like layout */
export function ModuleSkeleton() {
  return (
    <div className="flex h-full flex-col bg-bg-base p-6">
      {/* Header skeleton */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-bg-hover" />
        <div className="h-6 w-40 animate-pulse rounded bg-bg-hover" />
      </div>
      {/* Content skeleton */}
      <div className="flex-1 space-y-4">
        <div className="h-32 animate-pulse rounded-lg bg-bg-elevated" />
        <div className="flex gap-4">
          <div className="h-24 flex-1 animate-pulse rounded-lg bg-bg-elevated" />
          <div className="h-24 flex-1 animate-pulse rounded-lg bg-bg-elevated" />
        </div>
        <div className="h-48 animate-pulse rounded-lg bg-bg-elevated" />
      </div>
    </div>
  )
}

/** Inline skeleton for text content */
export function TextSkeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-bg-hover"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )
}

/** Card skeleton for grid layouts */
export function CardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated p-6">
      <div className="h-12 w-12 animate-pulse rounded-lg bg-bg-hover" />
      <div className="h-4 w-20 animate-pulse rounded bg-bg-hover" />
      <div className="h-3 w-28 animate-pulse rounded bg-bg-hover" />
    </div>
  )
}
