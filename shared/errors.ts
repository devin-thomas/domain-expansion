export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly issues?: FieldIssue[];
  readonly extra?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { retryable?: boolean; issues?: FieldIssue[]; extra?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.issues = options.issues;
    this.extra = options.extra;
  }
}

export function notFound(): ApiError {
  return new ApiError(404, 'not_found', 'Not found');
}

export function errorBody(error: ApiError, requestId: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId,
      retryable: error.retryable,
      ...(error.issues ? { issues: error.issues } : {}),
      ...(error.extra ?? {}),
    },
  };
}
