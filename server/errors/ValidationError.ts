import { AppError, ErrorCodes } from '@shared/utils/errors';

/**
 * Validation error for invalid request data
 * Used when request body/query/params fail validation
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCodes.VALIDATION_ERROR, message, 400, details);
    this.name = 'ValidationError';
  }
}
