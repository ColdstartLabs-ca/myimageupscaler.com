/**
 * Server-side error classes
 * Extend the base AppError with specific error types for API routes
 */

export { ValidationError } from './ValidationError';
export { AuthError } from './AuthError';
export { NotFoundError } from './NotFoundError';

// Re-export AppError for convenience
export { AppError, ErrorCodes, createErrorResponse, createSuccessResponse } from '@shared/utils/errors';
