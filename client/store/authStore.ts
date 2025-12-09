/**
 * DEPRECATED: Re-export from unified user store.
 * This maintains backward compatibility with existing imports.
 * New code should import directly from '@client/store/userStore'.
 */
export { useUserStore as useAuthStore, useIsAdmin } from './userStore';

// Legacy type exports - map to userStore types
import type { IUserState } from './userStore';

export type IAuthState = IUserState;
export type IAuthUser = IUserState['user'];
