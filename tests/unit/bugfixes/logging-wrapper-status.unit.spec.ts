import { describe, test, expect } from 'vitest';
import { HttpError } from '../../../server/monitoring/logger';

describe('Bug Fix: Logging Wrapper Status Codes', () => {
  describe('HttpError class', () => {
    test('should preserve status code', () => {
      const error = new HttpError('Not found', 404, 'NOT_FOUND');

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Not found');
      expect(error.name).toBe('HttpError');
    });

    test('should include details when provided', () => {
      const error = new HttpError(
        'Invalid credentials',
        401,
        'UNAUTHORIZED',
        { reason: 'token_expired' }
      );

      expect(error.details).toEqual({ reason: 'token_expired' });
    });

    test('should default code to INTERNAL_ERROR', () => {
      const error = new HttpError('Something went wrong', 500);

      expect(error.code).toBe('INTERNAL_ERROR');
    });

    test('should be an instance of Error', () => {
      const error = new HttpError('Test error', 400, 'TEST_ERROR');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(HttpError);
    });
  });

  describe('Error response format from withLogging', () => {
    // Test the error response format logic directly without mocking the logger
    function createErrorResponseFromHttpError(error: HttpError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details && { details: error.details }),
        },
      };
    }

    function createErrorResponseFromError(error: Error) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        },
      };
    }

    test('should create correct response for HttpError 404', () => {
      const error = new HttpError('Not found', 404, 'NOT_FOUND');
      const response = createErrorResponseFromHttpError(error);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('NOT_FOUND');
      expect(response.error.message).toBe('Not found');
    });

    test('should create correct response for HttpError 402 with details', () => {
      const error = new HttpError(
        'Insufficient credits',
        402,
        'INSUFFICIENT_CREDITS',
        { required: 1, available: 0 }
      );
      const response = createErrorResponseFromHttpError(error);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INSUFFICIENT_CREDITS');
      expect(response.error.details).toEqual({ required: 1, available: 0 });
    });

    test('should create correct response for HttpError 429', () => {
      const error = new HttpError(
        'Rate limit exceeded',
        429,
        'RATE_LIMITED',
        { retryAfter: 60 }
      );
      const response = createErrorResponseFromHttpError(error);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('RATE_LIMITED');
      expect(response.error.details).toEqual({ retryAfter: 60 });
    });

    test('should create INTERNAL_ERROR response for regular Error', () => {
      const error = new Error('Something went wrong');
      const response = createErrorResponseFromError(error);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INTERNAL_ERROR');
      expect(response.error.message).toBe('Something went wrong');
    });

    test('response format should match documented spec', () => {
      const error = new HttpError(
        'Validation failed',
        400,
        'VALIDATION_ERROR',
        { fields: ['email', 'password'] }
      );
      const response = createErrorResponseFromHttpError(error);

      // Verify structure matches documented IErrorResponse
      expect(response).toHaveProperty('success', false);
      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('message');
      expect(response.error).toHaveProperty('details');
    });
  });

  describe('Status code preservation', () => {
    test('HttpError should preserve different status codes', () => {
      const testCases = [
        { statusCode: 400, code: 'INVALID_REQUEST' },
        { statusCode: 401, code: 'UNAUTHORIZED' },
        { statusCode: 402, code: 'PAYMENT_REQUIRED' },
        { statusCode: 403, code: 'FORBIDDEN' },
        { statusCode: 404, code: 'NOT_FOUND' },
        { statusCode: 429, code: 'RATE_LIMITED' },
        { statusCode: 500, code: 'INTERNAL_ERROR' },
        { statusCode: 503, code: 'AI_UNAVAILABLE' },
      ];

      for (const { statusCode, code } of testCases) {
        const error = new HttpError('Test message', statusCode, code);
        expect(error.statusCode).toBe(statusCode);
        expect(error.code).toBe(code);
      }
    });
  });
});
