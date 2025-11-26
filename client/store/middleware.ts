/* eslint-disable no-undef */
import { IStore } from '@client/store/createStore';

export type Middleware<T> = (store: IStore<T>) => IStore<T>;

interface IDevToolsMessage {
  type: string;
  payload: {
    type: string;
  };
  state: string;
}

interface IDevToolsExtension {
  connect: () => {
    init: (state: unknown) => void;
    send: (action: string, state: unknown) => void;
    subscribe: (listener: (message: IDevToolsMessage) => void) => void;
  };
}

declare global {
  interface IWindow extends Window {
    __REDUX_DEVTOOLS_EXTENSION__?: IDevToolsExtension;
  }
}

export const devtools = <T extends object>(store: IStore<T>): IStore<T> => {
  const devtoolsExtension = (window as IWindow).__REDUX_DEVTOOLS_EXTENSION__;

  if (!devtoolsExtension) {
    return store;
  }

  const devtools = devtoolsExtension.connect();
  let isUpdating = false;

  devtools.init(store.getState());

  const enhancedStore: IStore<T> = {
    ...store,
    setState: updater => {
      if (!isUpdating) {
        const nextState = { ...store.getState(), ...updater(store.getState()) };
        devtools.send('State Update', nextState);
      }
      store.setState(updater);
    },
  };

  devtools.subscribe((message: IDevToolsMessage) => {
    if (message.type === 'DISPATCH' && message.payload.type === 'JUMP_TO_ACTION') {
      isUpdating = true;
      enhancedStore.setState(() => JSON.parse(message.state));
      isUpdating = false;
    }
  });

  return enhancedStore;
};
