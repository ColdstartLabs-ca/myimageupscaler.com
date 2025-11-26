import { create } from 'zustand';

export interface ILoadingState {
  isLoading: boolean;
  setLoading: (isLoading: boolean) => void;
}

export const loadingStore = create<ILoadingState>(set => ({
  isLoading: false,
  setLoading: (isLoading: boolean) => set(() => ({ isLoading })),
}));

export const useLoadingStore = (): ILoadingState => {
  const { isLoading, setLoading } = loadingStore();
  return { isLoading, setLoading };
};
