export const STORE_SESSION_CHANGED_EVENT = 'storeSessionChanged';

export interface StoreSessionUser {
  id?: string;
  username?: string;
  role?: string;
  storeId?: string;
  storeName?: string;
}

const getStoreScope = (user: StoreSessionUser | null): string => {
  if (!user) return 'signed-out';
  return user.storeId ? `store:${user.storeId}` : `global:${user.role || 'unknown'}`;
};

export const parseStoredSessionUser = (raw: string | null): StoreSessionUser | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const shouldResetActiveStoreSession = (
  previousUser: StoreSessionUser | null,
  nextUser: StoreSessionUser | null
): boolean => {
  if (!previousUser && !nextUser) return false;
  if (!previousUser || !nextUser) return true;

  return getStoreScope(previousUser) !== getStoreScope(nextUser)
    || String(previousUser.id || previousUser.username || '') !== String(nextUser.id || nextUser.username || '');
};

const dispatchStoreSessionChanged = (
  previousUser: StoreSessionUser | null,
  nextUser: StoreSessionUser | null
) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STORE_SESSION_CHANGED_EVENT, {
    detail: {
      previousStoreId: previousUser?.storeId || null,
      nextStoreId: nextUser?.storeId || null,
      previousUserId: previousUser?.id || previousUser?.username || null,
      nextUserId: nextUser?.id || nextUser?.username || null,
    },
  }));
};

export const persistAuthenticatedSession = (nextUser: StoreSessionUser) => {
  const previousUser = parseStoredSessionUser(localStorage.getItem('current_user'));
  localStorage.setItem('current_user', JSON.stringify(nextUser));

  if (shouldResetActiveStoreSession(previousUser, nextUser)) {
    dispatchStoreSessionChanged(previousUser, nextUser);
  }
};

export const clearAuthenticatedSession = () => {
  const previousUser = parseStoredSessionUser(localStorage.getItem('current_user'));
  localStorage.removeItem('current_user');

  if (shouldResetActiveStoreSession(previousUser, null)) {
    dispatchStoreSessionChanged(previousUser, null);
  }
};
