# Auth & Dashboard Improvements PRD

## 1. Problem Description

The current authentication flow and dashboard experience have several UX issues:

1.  **Auth Flicker**: When a logged-in user visits the landing page, they briefly see the "Sign In" button before it swaps to the user dropdown. This is due to the initial auth check being asynchronous and the UI rendering the default "logged out" state first.
2.  **Landing Page Redirect**: Logged-in users are not automatically redirected to the dashboard when visiting the landing page. They have to click "Dashboard" manually.
3.  **Credits Visibility**: The user's credit balance is not easily visible on the dashboard. It is currently only shown in the `NavBar`, which might not be prominent enough or present in the dashboard layout.

## 2. Goals

- **Eliminate Auth Flicker**: Ensure the navigation bar does not show "Sign In" while the authentication state is being determined.
- **Auto-Redirect**: Automatically redirect authenticated users from the landing page (`/`) to the dashboard (`/dashboard`).
- **Dashboard Credits**: Display the user's credit balance prominently within the Dashboard UI (e.g., in the sidebar).

## 3. Proposed Solution

### 3.1. Auth Flicker Fix

- **Component**: `src/components/navigation/NavBar.tsx`
- **Logic**:
  - Utilize `authStore.isLoading` to detect when the auth check is in progress.
  - If `isLoading` is `true`, render a loading skeleton or an empty state in place of the "Sign In" / User Dropdown section.
  - This prevents the "Sign In" button from appearing momentarily for authenticated users.

### 3.2. Landing Page Redirect

- **Component**: `src/App.tsx` (or a new `AuthGuard` component)
- **Logic**:
  - Add a `useEffect` hook to check `isAuthenticated` and `!isLoading`.
  - If the user is authenticated, use `window.location.href` (or a router navigation method if available) to redirect to `/dashboard`.
  - Show a full-screen loading state while the redirect is processing to prevent the landing page from flashing.

### 3.3. Dashboard Credits Display

- **Component**: `src/components/dashboard/DashboardSidebar.tsx`
- **Logic**:
  - Import and reuse the existing `CreditsDisplay` component.
  - Place it within the "User Info" section or a dedicated "Billing/Credits" section in the sidebar.
  - Ensure it matches the sidebar's design language.

## 4. Technical Requirements

- **State Management**: Use `useAuthStore` for auth state (`isAuthenticated`, `isLoading`, `user`).
- **Routing**: Verify if the project uses `react-router-dom` or Next.js routing.
  - _Note_: The codebase contains imports from `next/navigation` and `next/link`, but the entry point is `main.tsx` (Vite). This suggests a potential mix or a migration. The implementation will rely on `window.location.href` for redirects if a client-side router is not fully integrated for these paths, or use the appropriate router hook if available.

## 5. Verification Plan

- **Manual Testing**:
  - **Flicker**: Log in, refresh the landing page. Verify "Sign In" button does not appear.
  - **Redirect**: Log in, go to `/`. Verify automatic redirect to `/dashboard`.
  - **Credits**: Go to Dashboard. Verify credits are displayed in the sidebar.
