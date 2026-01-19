// Structured logging utilities

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ServiceName = 'chat' | 'mcp' | 'llm' | 'scraper' | 'api' | 'browser';

export interface LogEntry {
  timestamp: string; // ISO 8601
  level: LogLevel;
  service: ServiceName;
  event: string;
  duration?: number; // ms
  metadata?: Record<string, unknown>;
  traceId?: string;
}

class Logger {
  private traceId?: string;

  setTraceId(traceId: string): void {
    this.traceId = traceId;
  }

  clearTraceId(): void {
    this.traceId = undefined;
  }

  private log(
    level: LogLevel,
    service: ServiceName,
    event: string,
    metadata?: Record<string, unknown>,
    duration?: number
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      event,
      duration,
      metadata,
      traceId: this.traceId,
    };

    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logFn(JSON.stringify(entry));
  }

  debug(service: ServiceName, event: string, metadata?: Record<string, unknown>): void {
    this.log('debug', service, event, metadata);
  }

  info(service: ServiceName, event: string, metadata?: Record<string, unknown>): void {
    this.log('info', service, event, metadata);
  }

  warn(service: ServiceName, event: string, metadata?: Record<string, unknown>): void {
    this.log('warn', service, event, metadata);
  }

  error(service: ServiceName, event: string, metadata?: Record<string, unknown>): void {
    this.log('error', service, event, metadata);
  }

  // Log with duration for performance tracking
  withDuration(
    level: LogLevel,
    service: ServiceName,
    event: string,
    duration: number,
    metadata?: Record<string, unknown>
  ): void {
    this.log(level, service, event, metadata, duration);
  }
}

export const logger = new Logger();
