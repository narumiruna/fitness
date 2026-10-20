export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 503,
    public readonly code: string,
  ) {
    super(code);
  }
}
export class ActionRedirect extends Error {
  constructor(public readonly destination: string) {
    super("Action redirect");
  }
}
export function redirect(destination: string): never {
  throw new ActionRedirect(destination);
}
