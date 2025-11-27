import { describe, test, expect } from 'vitest';
import {
  ErrorCodes,
  AppError,
  createErrorResponse,
  createSuccessResponse,
  ErrorStatusMap,
  type IErrorResponse,
  type ISuccessResponse,
} from '../../../shared/utils/errors';

describe('Bug Fix: Standardized Error Response Format', () => {
  describe('ErrorCodes', () => {
    test('should have all documented error codes', () => {
      // 4xx Client Errors
      expect(ErrorCodes.INVALID_REQUEST).toBe('INVALID_REQUEST');
      expect(ErrorCodes.INVALID_FILE).toBe('INVALID_FILE');
      expect(ErrorCodes.FILE_TOO_LARGE).toBe('FILE_TOO_LARGE');
      expect(ErrorCodes.INVALID_DIMENSIONS).toBe('INVALID_DIMENSIONS');
      expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCodes.INSUFFICIENT_CREDITS).toBe('INSUFFICIENT_CREDITS');
      expect(ErrorCodes.RATE_LIMITED).toBe('RATE_LIMITED');

      // 5xx Server Errors
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCodes.AI_UNAVAILABLE).toBe('AI_UNAVAILABLE');
      expect(ErrorCodes.PROCESSING_FAILED).toBe('PROCESSING_FAILED');
    });
  });

  describe('AppError class', () => {
    test('should create error with code, message, and status', () => {
      const error = new AppError(
        ErrorCodes.INSUFFICIENT_CREDITS,
        'Not enough credits',
        402,
        { required: 1, available: 0 }
      );

      expect(error.code).toBe('INSUFFICIENT_CREDITS');
      expect(error.message).toBe('Not enough credits');
      expect(error.statusCode).toBe(402);
      expect(error.details).toEqual({ required: 1, available: 0 });
      expect(error.name).toBe('AppError');
    });

    test('should default to status 500', () => {
      const error = new AppError(ErrorCodes.INTERNAL_ERROR, 'Something went wrong');

      expect(error.statusCode).toBe(500);
    });
  });

  describe('createErrorResponse', () => {
    test('should create error response matching documented spec', () => {
      const { body, status } = createErrorResponse(
        ErrorCodes.INSUFFICIENT_CREDITS,
        'Not enough credits. You have 0 credits, but this action requires 1.',
        402,
        { currentBalance: 0, required: 1 }
      );

      expect(status).toBe(402);
      expect(body).toEqual<IErrorResponse>({
        success: false,
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: 'Not enough credits. You have 0 credits, but this action requires 1.',
          details: { currentBalance: 0, required: 1 },
        },
      });
    });

    test('should include requestId when provided', () => {
      const { body } = createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'An error occurred',
        500,
        undefined,
        'req_12345'
      );

      expect(body.error.requestId).toBe('req_12345');
    });

    test('should omit details when not provided', () => {
      const { body } = createErrorResponse(ErrorCodes.UNAUTHORIZED, 'Please log in', 401);

      expect(body.error.details).toBeUndefined();
    });

    test('should create validation error response', () => {
      const { body, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid request data',
        400,
        {
          validationErrors: [
            { path: ['email'], message: 'Invalid email format' },
          ],
        }
      );

      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details?.validationErrors).toBeDefined();
    });

    test('should create rate limit error response', () => {
      const { body, status } = createErrorResponse(
        ErrorCodes.RATE_LIMITED,
        'Too many requests. Please try again in 5 seconds.',
        429,
        { retryAfter: 5 }
      );

      expect(status).toBe(429);
      expect(body).toEqual<IErrorResponse>({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again in 5 seconds.',
          details: { retryAfter: 5 },
        },
      });
    });
  });

  describe('createSuccessResponse', () => {
    test('should create success response', () => {
      const data = { imageUrl: 'https://example.com/image.png' };
      const response = createSuccessResponse(data);

      expect(response).toEqual<ISuccessResponse<typeof data>>({
        success: true,
        data,
      });
    });

    test('should work with array data', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const response = createSuccessResponse(data);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
    });
  });

  describe('ErrorStatusMap', () => {
    test('should map error codes to correct status codes', () => {
      expect(ErrorStatusMap[ErrorCodes.INVALID_REQUEST].status).toBe(400);
      expect(ErrorStatusMap[ErrorCodes.UNAUTHORIZED].status).toBe(401);
      expect(ErrorStatusMap[ErrorCodes.INSUFFICIENT_CREDITS].status).toBe(402);
      expect(ErrorStatusMap[ErrorCodes.FORBIDDEN].status).toBe(403);
      expect(ErrorStatusMap[ErrorCodes.NOT_FOUND].status).toBe(404);
      expect(ErrorStatusMap[ErrorCodes.RATE_LIMITED].status).toBe(429);
      expect(ErrorStatusMap[ErrorCodes.INTERNAL_ERROR].status).toBe(500);
      expect(ErrorStatusMap[ErrorCodes.AI_UNAVAILABLE].status).toBe(503);
    });

    test('should provide default messages', () => {
      expect(ErrorStatusMap[ErrorCodes.UNAUTHORIZED].defaultMessage).toBe(
        'Authentication is required.'
      );
      expect(ErrorStatusMap[ErrorCodes.INSUFFICIENT_CREDITS].defaultMessage).toBe(
        'You do not have enough credits for this action.'
      );
    });
  });
});
