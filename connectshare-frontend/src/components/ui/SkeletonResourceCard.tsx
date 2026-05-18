export const SkeletonResourceCard = () => {
  return (
    <div className="glass-card p-4 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded shimmer flex-shrink-0" />
        <div className="w-16 h-4 rounded shimmer" />
      </div>
      <div className="space-y-2 flex-1">
        <div className="w-3/4 h-5 rounded shimmer" />
        <div className="w-1/2 h-4 rounded shimmer" />
      </div>
      <div className="flex gap-2">
        <div className="w-12 h-6 rounded shimmer" />
        <div className="w-16 h-6 rounded shimmer" />
      </div>
      <div className="flex items-center justify-between pt-4 border-t border-border-color">
        <div className="w-24 h-4 rounded shimmer" />
        <div className="w-16 h-4 rounded shimmer" />
      </div>
    </div>
  );
};
