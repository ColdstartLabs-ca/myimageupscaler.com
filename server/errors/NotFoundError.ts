import { AppError, ErrorCodes } from '@shared/utils/errors';

/**
 * Not found error for missing resources
 * Used when a requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(ErrorCodes.NOT_FOUND, `${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}
