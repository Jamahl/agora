export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-7 w-7 rounded-md bg-ink-900 text-white grid place-items-center text-xs font-bold">
        A
      </div>
      <div className="text-base font-semibold tracking-tight">Agora</div>
    </div>
  );
}
