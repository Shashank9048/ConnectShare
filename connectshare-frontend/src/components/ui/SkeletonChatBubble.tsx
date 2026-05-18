export const SkeletonChatBubble = () => {
  return (
    <div className="flex flex-col gap-4">
      {/* Received */}
      <div className="flex justify-start">
        <div className="glass-card p-3 rounded-[16px_16px_16px_4px] w-48 max-w-[80%]">
          <div className="w-16 h-3 shimmer mb-2 rounded" />
          <div className="w-full h-4 shimmer rounded" />
        </div>
      </div>
      {/* Sent */}
      <div className="flex justify-end">
        <div className="bg-bg-secondary p-3 rounded-[16px_16px_4px_16px] w-64 max-w-[80%]">
          <div className="w-full h-4 shimmer rounded mb-2" />
          <div className="w-2/3 h-4 shimmer rounded" />
        </div>
      </div>
      {/* Received */}
      <div className="flex justify-start">
        <div className="glass-card p-3 rounded-[16px_16px_16px_4px] w-56 max-w-[80%]">
          <div className="w-20 h-3 shimmer mb-2 rounded" />
          <div className="w-3/4 h-4 shimmer rounded" />
        </div>
      </div>
    </div>
  );
};
