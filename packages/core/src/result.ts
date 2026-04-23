/**
 * Discriminated union for typed success/error returns.
 * Used across all contracts — functions return Result instead of throwing.
 */

export type Result<T, E> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
