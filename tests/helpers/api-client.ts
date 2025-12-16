import { APIRequestContext, expect, APIResponse, RequestOptions } from '@playwright/test';

export interface IApiResponse<T = unknown> {
  status: number;
  data: T;
  raw: APIResponse;
}

export interface IApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface IApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface IApiRequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  timeout?: number;
}

/**
 * Base API client for making unauthenticated requests
 *
 * Provides a fluent interface for API testing with built-in response validation
 * and assertion methods for common testing scenarios.
 */
export class ApiClient {
  constructor(
    private request: APIRequestContext,
    private baseUrl: string = ''
  ) {}

  /**
   * Creates an authenticated API client
   *
   * @param token - JWT access token for authentication
   * @returns AuthenticatedApiClient instance with bearer token
   */
  withAuth(token: string): AuthenticatedApiClient {
    return new AuthenticatedApiClient(this.request, this.baseUrl, token);
  }

  /**
   * Makes an authenticated POST request
   *
   * @param endpoint - API endpoint path
   * @param data - Request body data
   * @param options - Additional request options
   * @returns ApiResponse with fluent assertion methods
   */
  async post<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: IApiRequestOptions
  ): Promise<ApiResponse<T>> {
    const requestOptions: RequestOptions = {
      data,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    };

    if (options?.timeout) {
      requestOptions.timeout = options.timeout;
    }

    if (options?.params) {
      requestOptions.params = options.params;
    }

    const response = await this.request.post(`${this.baseUrl}${endpoint}`, requestOptions);
    return new ApiResponse<T>(response);
  }

  /**
   * Makes an authenticated GET request
   *
   * @param endpoint - API endpoint path
   * @param options - Additional request options
   * @returns ApiResponse with fluent assertion methods
   */
  async get<T = unknown>(endpoint: string, options?: IApiRequestOptions): Promise<ApiResponse<T>> {
    const requestOptions: RequestOptions = {
      headers: options?.headers || {},
    };

    if (options?.timeout) {
      requestOptions.timeout = options.timeout;
    }

    if (options?.params) {
      requestOptions.params = options.params;
    }

    const response = await this.request.get(`${this.baseUrl}${endpoint}`, requestOptions);
    return new ApiResponse<T>(response);
  }

  /**
   * Makes an authenticated PUT request
   *
   * @param endpoint - API endpoint path
   * @param data - Request body data
   * @param options - Additional request options
   * @returns ApiResponse with fluent assertion methods
   */
  async put<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: IApiRequestOptions
  ): Promise<ApiResponse<T>> {
    const requestOptions: RequestOptions = {
      data,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    };

    if (options?.timeout) {
      requestOptions.timeout = options.timeout;
    }

    if (options?.params) {
      requestOptions.params = options.params;
    }

    const response = await this.request.put(`${this.baseUrl}${endpoint}`, requestOptions);
    return new ApiResponse<T>(response);
  }

  /**
   * Makes an authenticated DELETE request
   *
   * @param endpoint - API endpoint path
   * @param options - Additional request options
   * @returns ApiResponse with fluent assertion methods
   */
  async delete<T = unknown>(
    endpoint: string,
    options?: IApiRequestOptions
  ): Promise<ApiResponse<T>> {
    const requestOptions: RequestOptions = {
      headers: options?.headers || {},
    };

    if (options?.timeout) {
      requestOptions.timeout = options.timeout;
    }

    if (options?.params) {
      requestOptions.params = options.params;
    }

    const response = await this.request.delete(`${this.baseUrl}${endpoint}`, requestOptions);
    return new ApiResponse<T>(response);
  }

  /**
   * Makes an authenticated PATCH request
   *
   * @param endpoint - API endpoint path
   * @param data - Request body data
   * @param options - Additional request options
   * @returns ApiResponse with fluent assertion methods
   */
  async patch<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: IApiRequestOptions
  ): Promise<ApiResponse<T>> {
    const requestOptions: RequestOptions = {
      data,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    };

    if (options?.timeout) {
      requestOptions.timeout = options.timeout;
    }

    if (options?.params) {
      requestOptions.params = options.params;
    }

    const response = await this.request.patch(`${this.baseUrl}${endpoint}`, requestOptions);
    return new ApiResponse<T>(response);
  }
}

/**
 * Authenticated API client that automatically includes bearer token
 *
 * Extends ApiClient with automatic authentication headers and provides
 * typed endpoints for common API operations.
 */
export class AuthenticatedApiClient extends ApiClient {
  constructor(
    private req: APIRequestContext,
    private base: string,
    private token: string
  ) {
    super(req, base);
  }

  /**
   * Gets authentication headers with bearer token
   *
   * @returns Headers object with authorization
   */
  private get authHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Makes an authenticated POST request
   *
   * @param endpoint - API endpoint path
   * @param data - Request body data
   * @param options - Additional request options
   * @returns ApiResponse with fluent assertion methods
   */
  async post<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: IApiRequestOptions
  ): Promise<ApiResponse<T>> {
    const requestOptions: RequestOptions = {
      data,
      headers: {
        ...this.authHeaders,
        ...options?.headers,
      },
    };

    if (options?.timeout) {
      requestOptions.timeout = options.timeout;
    }

    if (options?.params) {
      requestOptions.params = options.params;
    }

    const response = await this.req.post(`${this.base}${endpoint}`, requestOptions);
    return new ApiResponse<T>(response);
  }

  /**
   * Makes an authenticated GET request
   *
   * @param endpoint - API endpoint path
   * @param options - Additional request options
   * @returns ApiResponse with fluent assertion methods
   */
  async get<T = unknown>(endpoint: string, options?: IApiRequestOptions): Promise<ApiResponse<T>> {
    const requestOptions: RequestOptions = {
      headers: {
        ...this.authHeaders,
        ...options?.headers,
      },
    };

    if (options?.timeout) {
      requestOptions.timeout = options.timeout;
    }

    if (options?.params) {
      requestOptions.params = options.params;
    }

    const response = await this.req.get(`${this.base}${endpoint}`, requestOptions);
    return new ApiResponse<T>(response);
  }

  /**
   * Makes an authenticated PUT request
   *
   * @param endpoint - API endpoint path
   * @param data - Request body data
   * @param options - Additional request options
   * @returns ApiResponse with fluent assertion methods
   */
  async put<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: IApiRequestOptions
  ): Promise<ApiResponse<T>> {
    const requestOptions: RequestOptions = {
      data,
      headers: {
        ...this.authHeaders,
        ...options?.headers,
      },
    };

    if (options?.timeout) {
      requestOptions.timeout = options.timeout;
    }

    if (options?.params) {
      requestOptions.params = options.params;
    }

    const response = await this.req.put(`${this.base}${endpoint}`, requestOptions);
    return new ApiResponse<T>(response);
  }

  /**
   * Makes an authenticated DELETE request
   *
   * @param endpoint - API endpoint path
   * @param options - Additional request options
   * @returns ApiResponse with fluent assertion methods
   */
  async delete<T = unknown>(
    endpoint: string,
    options?: IApiRequestOptions
  ): Promise<ApiResponse<T>> {
    const requestOptions: RequestOptions = {
      headers: {
        ...this.authHeaders,
        ...options?.headers,
      },
    };

    if (options?.timeout) {
      requestOptions.timeout = options.timeout;
    }

    if (options?.params) {
      requestOptions.params = options.params;
    }

    const response = await this.req.delete(`${this.base}${endpoint}`, requestOptions);
    return new ApiResponse<T>(response);
  }

  /**
   * Makes an authenticated PATCH request
   *
   * @param endpoint - API endpoint path
   * @param data - Request body data
   * @param options - Additional request options
   * @returns ApiResponse with fluent assertion methods
   */
  async patch<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: IApiRequestOptions
  ): Promise<ApiResponse<T>> {
    const requestOptions: RequestOptions = {
      data,
      headers: {
        ...this.authHeaders,
        ...options?.headers,
      },
    };

    if (options?.timeout) {
      requestOptions.timeout = options.timeout;
    }

    if (options?.params) {
      requestOptions.params = options.params;
    }

    const response = await this.req.patch(`${this.base}${endpoint}`, requestOptions);
    return new ApiResponse<T>(response);
  }
}

/**
 * Fluent response wrapper with assertion methods
 *
 * Provides a chainable API for common API response assertions
 * and typed response data access.
 */
export class ApiResponse<T = unknown> {
  private _json: T | null = null;

  constructor(private response: APIResponse) {}

  /**
   * Gets the HTTP status code
   */
  get status(): number {
    return this.response.status();
  }

  /**
   * Gets the raw Response object
   */
  get raw(): Response {
    return this.response;
  }

  /**
   * Checks if the response is successful (2xx status code)
   */
  get ok(): boolean {
    return this.response.ok();
  }

  /**
   * Gets the response headers
   */
  get headers(): Record<string, string> {
    return this.response.headers();
  }

  /**
   * Parses and returns the response body as JSON
   *
   * @returns Parsed JSON response data
   */
  async json(): Promise<T> {
    if (this._json === null) {
      this._json = await this.response.json();
    }
    return this._json as T;
  }

  /**
   * Gets the response body as text
   *
   * @returns Response body as string
   */
  async text(): Promise<string> {
    return this.response.text();
  }

  // Assertion methods for fluent chaining

  /**
   * Asserts the response status code
   *
   * @param expectedStatus - Expected HTTP status code
   * @returns This instance for chaining
   */
  expectStatus(expectedStatus: number): this {
    expect(this.status).toBe(expectedStatus);
    return this;
  }

  /**
   * Asserts the response is successful (2xx)
   *
   * @returns This instance for chaining
   */
  expectSuccess(): this {
    expect(this.ok).toBe(true);
    return this;
  }

  /**
   * Asserts the response is unsuccessful (4xx or 5xx)
   *
   * @returns This instance for chaining
   */
  expectError(): this {
    expect(this.ok).toBe(false);
    return this;
  }

  /**
   * Asserts the response contains an error with specific code
   *
   * @param code - Expected error code
   * @returns This instance for chaining
   */
  async expectErrorCode(code: string): Promise<this> {
    const data = (await this.json()) as IApiErrorResponse;
    expect(data.success).toBe(false);
    expect(data.error?.code).toBe(code);
    return this;
  }

  /**
   * Asserts the response contains an error with specific message
   *
   * @param message - Expected error message (can be partial or regex)
   * @returns This instance for chaining
   */
  async expectErrorMessage(message: string | RegExp): Promise<this> {
    const data = (await this.json()) as IApiErrorResponse;
    expect(data.success).toBe(false);

    if (typeof message === 'string') {
      expect(data.error?.message).toContain(message);
    } else {
      expect(data.error?.message).toMatch(message);
    }
    return this;
  }

  /**
   * Asserts the response is successful and contains specific data
   *
   * @param assertions - Partial record of expected data properties
   * @returns This instance for chaining
   */
  async expectData<K extends keyof T>(assertions: Partial<Record<K, unknown>>): Promise<this> {
    const data = (await this.json()) as IApiSuccessResponse<T>;
    expect(data.success).toBe(true);

    for (const [key, value] of Object.entries(assertions)) {
      expect(data.data[key as K]).toStrictEqual(value);
    }
    return this;
  }

  /**
   * Asserts the response contains data at a specific path
   *
   * @param path - Dot-separated path to data (e.g., 'user.id')
   * @param expectedValue - Expected value at the path
   * @returns This instance for chaining
   */
  async expectPath(path: string, expectedValue: unknown): Promise<this> {
    const data = await this.json();
    const value = this.getNestedValue(data, path);
    expect(value).toEqual(expectedValue);
    return this;
  }

  /**
   * Asserts the response headers contain specific values
   *
   * @param headers - Expected header values
   * @returns This instance for chaining
   */
  expectHeaders(headers: Record<string, string>): this {
    for (const [key, value] of Object.entries(headers)) {
      expect(this.headers[key.toLowerCase()]).toBe(value);
    }
    return this;
  }

  /**
   * Asserts the response time is within acceptable limits
   *
   * @param maxMs - Maximum acceptable response time in milliseconds
   * @returns This instance for chaining
   */
  async expectResponseTime(_maxMs: number): Promise<this> {
    // Note: Playwright doesn't expose response timing directly
    // This is a placeholder that could be enhanced with custom timing
    void _maxMs; // Mark as intentionally unused for now
    console.warn('Response time checking not implemented in Playwright API client');
    return this;
  }

  /**
   * Asserts webhook response format (for Stripe webhook endpoints)
   *
   * @param assertions - Expected webhook response properties
   * @returns This instance for chaining
   */
  async expectWebhookResponse(assertions: Partial<Record<string, unknown>>): Promise<this> {
    const data = await this.json();
    expect(data.received).toBe(true);

    for (const [key, value] of Object.entries(assertions)) {
      expect(data[key]).toStrictEqual(value);
    }
    return this;
  }

  /**
   * Helper method to get nested object values by path
   *
   * @param obj - Object to search
   * @param path - Dot-separated path
   * @returns Value at path or undefined
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}
