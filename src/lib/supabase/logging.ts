type SupabaseErrorShape = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

type LogContext = Record<string, string | number | boolean | null | undefined>;

const getErrorDetails = (error: unknown) => {
  if (error && typeof error === 'object') {
    const candidate = error as SupabaseErrorShape;
    return {
      code: typeof candidate.code === 'string' ? candidate.code : undefined,
      message: typeof candidate.message === 'string' ? candidate.message : 'Unknown Supabase error',
      details: typeof candidate.details === 'string' ? candidate.details : undefined,
      hint: typeof candidate.hint === 'string' ? candidate.hint : undefined,
    };
  }

  return { message: error instanceof Error ? error.message : 'Unknown Supabase error' };
};

export const logSupabaseError = (scope: string, operation: string, error: unknown, context: LogContext) => {
  if (process.env.NODE_ENV === 'production') return;

  console.error(`[${scope}] ${operation} failed`, {
    ...context,
    error: getErrorDetails(error),
  });
};
