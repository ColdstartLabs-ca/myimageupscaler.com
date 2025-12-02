'use client';

import { isDevelopment } from '@shared/config/env';

type LogLevel = 'info' | 'warn' | 'error';

interface ILogContext {
  [key: string]: unknown;
}

/**
 * Client-side logger utility.
 * In production, logs to Baselime RUM.
 * In development, logs to console with proper formatting.
 */
export class ClientLogger {
  private static log(level: LogLevel, message: string, context?: ILogContext): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      source: 'pixelperfect-web',
    };

    if (isDevelopment()) {
      // In development, use console methods for easier debugging
      const prefix = `[${level.toUpperCase()}] ${message}`;

      switch (level) {
        case 'info':
          console.info(prefix, context);
          break;
        case 'warn':
          console.warn(prefix, context);
          break;
        case 'error':
          console.error(prefix, context);
          break;
      }
      return;
    }

    // In production, Baselime RUM automatically captures console logs
    // We can enhance this with specific Baselime logging if needed
    try {
      if (level === 'error') {
        // Log to Baselime RUM via console.error (automatically captured)

        console.error(JSON.stringify(logEntry));
      }
    } catch (loggingError) {
      // Fallback to console if structured logging fails

      console.error('Logger failed:', loggingError);
    }
  }

  public static info(message: string, context?: ILogContext): void {
    this.log('info', message, context);
  }

  public static warn(message: string, context?: ILogContext): void {
    this.log('warn', message, context);
  }

  public static error(message: string, context?: ILogContext): void {
    this.log('error', message, context);
  }
}

/**
 * Hook for creating a contextual logger
 */
export function useLogger(componentName: string): {
  info: (message: string, context?: ILogContext) => void;
  warn: (message: string, context?: ILogContext) => void;
  error: (message: string, context?: ILogContext) => void;
} {
  return {
    info: (message: string, context?: ILogContext) =>
      ClientLogger.info(message, { component: componentName, ...context }),
    warn: (message: string, context?: ILogContext) =>
      ClientLogger.warn(message, { component: componentName, ...context }),
    error: (message: string, context?: ILogContext) =>
      ClientLogger.error(message, { component: componentName, ...context }),
  };
}
