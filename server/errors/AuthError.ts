import { AppError, ErrorCodes } from '@shared/utils/errors';

/**
 * Authentication/authorization error
 * Used when user is not authenticated or lacks permission
 */
export class AuthError extends AppError {
  constructor(
    message: string,
    code: typeof ErrorCodes.UNAUTHORIZED | typeof ErrorCodes.FORBIDDEN = ErrorCodes.UNAUTHORIZED,
    statusCode: number = 401
  ) {
    super(code, message, statusCode);
    this.name = 'AuthError';
  }
}
