import { useLoadingStore } from '@client/store/loadingStore';

export const LoadingBackdrop = (): JSX.Element | null => {
  const { isLoading } = useLoadingStore();

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <span className="loading loading-spinner loading-lg text-primary"></span>
    </div>
  );
};
