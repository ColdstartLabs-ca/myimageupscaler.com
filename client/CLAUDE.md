# Client Directory

## Overview

Client-side React components, hooks, and utilities that run in the browser.

## Structure

### Components (`client/components/`)

- `ui/` - Reusable UI components (buttons, inputs, modals, etc.)
- `layout/` - Layout components (headers, footers, sidebars)
- `forms/` - Form components with validation
- `features/` - Feature-specific components

### Hooks (`client/hooks/`)

- Custom React hooks for data fetching, state management, and utilities
- Examples: `useAuth`, `useSupabase`, `useStripe`, `useLocalStorage`

### Store (`client/store/`)

- Zustand stores for global client state
- Minimal usage - prefer server state via React Query

### Styles (`client/styles/`)

- Tailwind CSS configuration and custom styles
- Component-specific styling files

### Utils (`client/utils/`)

- Client-side utility functions
- Helpers for API calls, data formatting, etc.

## Key Rules

- All TypeScript files (`.ts`, `.tsx`)
- Use functional components with hooks
- Components should be small and focused — **extract complex JSX blocks into named subcomponents** instead of using inline comment blocks (e.g., `{/* Badge */}`). Subcomponents promote SRP and DRY.
- Use composition over inheritance
- Implement proper error boundaries
- Use React Query for server state management
- Use Zustand sparingly for global client state

## Dependencies

- React 18+ with hooks
- React Query/SWR for server state
- Zustand for minimal global state
- Tailwind CSS for styling
