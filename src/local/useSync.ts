import { useSyncExternalStore } from 'react';
import { getState, subscribe } from './sync';

export const useSyncState = () => useSyncExternalStore(subscribe, getState);

import { isLocked, subscribeLock } from './lock';
export const useLocked = () => useSyncExternalStore(subscribeLock, isLocked);
