type LoadingSkeletonProps = {
  label?: string;
  lines?: number;
  className?: string;
};

export function LoadingSkeleton({ label = "Loading", lines = 3, className = "" }: LoadingSkeletonProps) {
  return (
    <div className={`loadingSkeleton ${className}`.trim()} role="status" aria-label={label} aria-busy="true">
      <span className="srOnly">{label}</span>
      <div className="loadingSkeletonBlock loadingSkeletonBlock--hero" />
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className={`loadingSkeletonBlock ${index === lines - 1 ? "loadingSkeletonBlock--short" : ""}`} />
      ))}
    </div>
  );
}
