const DEFAULT_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'unprocessable',
  429: 'rate_limited',
};

export class HttpError extends Error {
  public readonly code: string;

  constructor(
    public readonly status: number,
    message: string,
    code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code ?? DEFAULT_CODES[status] ?? 'error';
  }
}
