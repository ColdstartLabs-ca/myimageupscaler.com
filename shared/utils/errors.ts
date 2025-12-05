/**
 * Standardized Error Handling Utilities
 *
 * All API errors follow the documented format in docs/technical/systems/error-handling.md
 */

/**
 * Error codes used throughout the application
 */
export const ErrorCodes = {
  // 4xx Client Errors
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_FILE: 'INVALID_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_DIMENSIONS: 'INVALID_DIMENSIONS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  RATE_LIMITED: 'RATE_LIMITED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',

  // 5xx Server Errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Standard error response format
 */
export interface IErrorResponse {
  success: false;
  error: {
    code: ErrorCode | string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

/**
 * Standard success response format
 */
export interface ISuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * Application error class with proper error code and details
 */
export class AppError extends Error {
  public readonly code: ErrorCode | string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode | string,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: ErrorCode | string,
  message: string,
  statusCode: number = 500,
  details?: Record<string, unknown>,
  requestId?: string
): { body: IErrorResponse; status: number } {
  return {
    body: {
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
        ...(requestId && { requestId }),
      },
    },
    status: statusCode,
  };
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T>(data: T): ISuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Map common errors to proper status codes and codes
 */
export const ErrorStatusMap: Record<ErrorCode, { status: number; defaultMessage: string }> = {
  [ErrorCodes.INVALID_REQUEST]: {
    status: 400,
    defaultMessage: 'The request is invalid or malformed.',
  },
  [ErrorCodes.INVALID_FILE]: {
    status: 400,
    defaultMessage: 'The uploaded file type is not supported.',
  },
  [ErrorCodes.FILE_TOO_LARGE]: {
    status: 400,
    defaultMessage: 'The uploaded file exceeds the size limit.',
  },
  [ErrorCodes.INVALID_DIMENSIONS]: {
    status: 400,
    defaultMessage: 'The image dimensions are out of bounds.',
  },
  [ErrorCodes.VALIDATION_ERROR]: {
    status: 400,
    defaultMessage: 'The request data is invalid.',
  },
  [ErrorCodes.UNAUTHORIZED]: {
    status: 401,
    defaultMessage: 'Authentication is required.',
  },
  [ErrorCodes.FORBIDDEN]: {
    status: 403,
    defaultMessage: 'You do not have permission to access this resource.',
  },
  [ErrorCodes.NOT_FOUND]: {
    status: 404,
    defaultMessage: 'The requested resource was not found.',
  },
  [ErrorCodes.INSUFFICIENT_CREDITS]: {
    status: 402,
    defaultMessage: 'You do not have enough credits for this action.',
  },
  [ErrorCodes.PAYMENT_REQUIRED]: {
    status: 402,
    defaultMessage: 'Payment is required to continue.',
  },
  [ErrorCodes.RATE_LIMITED]: {
    status: 429,
    defaultMessage: 'Too many requests. Please try again later.',
  },
  [ErrorCodes.INTERNAL_ERROR]: {
    status: 500,
    defaultMessage: 'An unexpected error occurred.',
  },
  [ErrorCodes.AI_UNAVAILABLE]: {
    status: 503,
    defaultMessage: 'AI service is temporarily unavailable.',
  },
  [ErrorCodes.PROCESSING_FAILED]: {
    status: 500,
    defaultMessage: 'Image processing failed.',
  },
};

/**
 * Safely serialize any error to a user-friendly string message
 * Handles Error objects, plain objects, and other types
 */
export function serializeError(error: unknown): string {
  // Handle Error instances
  if (error instanceof Error) {
    return error.message;
  }

  // Handle AppError with more context
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const appError = error as { code: string; message: string; details?: Record<string, unknown> };
    return appError.details
      ? `${appError.message} (${JSON.stringify(appError.details)})`
      : appError.message;
  }

  // Handle plain objects with message property
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }

  // Handle API error responses
  if (error && typeof error === 'object' && 'error' in error) {
    const errorObj = (error as { error: unknown }).error;
    if (errorObj && typeof errorObj === 'object' && 'message' in errorObj) {
      return String((errorObj as { message: unknown }).message);
    }
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  // Handle null/undefined
  if (error == null) {
    return 'An unknown error occurred';
  }

  // Last resort: try JSON.stringify for objects, or convert to string
  try {
    if (typeof error === 'object') {
      const jsonStr = JSON.stringify(error);
      // If it's just an empty object, provide a better message
      if (jsonStr === '{}' || jsonStr === '[]') {
        return 'An unknown error occurred';
      }
      return jsonStr;
    }
    return String(error);
  } catch {
    return 'An unknown error occurred';
  }
}
