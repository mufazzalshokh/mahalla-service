const safeErrorName = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const safeErrorCode = /^[A-Z][A-Z0-9_]{1,63}$/;

export interface SafeErrorMetadata {
  readonly code?: string;
  readonly name: string;
}

export function safeErrorMetadata(error: unknown): SafeErrorMetadata {
  if (!(error instanceof Error)) return { name: 'UnknownError' };
  const name = safeErrorName.test(error.name) ? error.name : 'Error';
  const candidate: unknown = (error as { readonly code?: unknown }).code;
  return typeof candidate === 'string' && safeErrorCode.test(candidate)
    ? { code: candidate, name }
    : { name };
}
