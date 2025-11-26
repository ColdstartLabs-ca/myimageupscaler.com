type Listener<T> = (state: T) => void;
type StateUpdater<T> = (state: T) => Partial<T>;

export interface IStore<T> {
  getState: () => T;
  setState: (updater: StateUpdater<T>) => void;
  subscribe: (listener: Listener<T>) => () => void;
}

export const createStore = <T extends object>(initialState: T): IStore<T> => {
  let state = initialState;
  const listeners = new Set<Listener<T>>();

  const getState = () => state;

  const setState = (updater: StateUpdater<T>) => {
    const nextState = { ...state, ...updater(state) };
    if (nextState !== state) {
      state = nextState;
      listeners.forEach(listener => listener(state));
    }
  };

  const subscribe = (listener: Listener<T>) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    getState,
    setState,
    subscribe,
  };
};

export const create = <T extends object>(
  initializer: (set: IStore<T>['setState'], get: IStore<T>['getState']) => T
): IStore<T> => {
  const store = createStore<T>({} as T);
  const state = initializer(store.setState, store.getState);
  store.setState(() => state);
  return store;
};
