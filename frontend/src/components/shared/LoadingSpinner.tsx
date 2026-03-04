export function LoadingSpinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-[calc(100vh-10rem)] w-full items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
        <span className="h-3 w-3 animate-ping rounded-full bg-primary/70" />
        <span className="mono-text">{label}</span>
      </div>
    </div>
  )
}
