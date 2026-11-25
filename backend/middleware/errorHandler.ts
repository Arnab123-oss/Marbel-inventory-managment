import type {NextFunction, Request, Response} from 'express';

export const notFoundApiHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  console.error('Unhandled backend error:', err);
  const errObj = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null;
  let status =
    errObj && typeof errObj.status === 'number'
      ? errObj.status
      : 500;

  if (errObj?.name === 'MulterError') {
    status = errObj.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  } else if (
    err instanceof Error &&
    err.message.startsWith('Unsupported image format')
  ) {
    status = 400;
  }

  const message =
    process.env.NODE_ENV === 'production' && status >= 500
      ? 'Internal server error.'
      : err instanceof Error
        ? err.message
        : 'Internal server error.';
  res.status(status).json({success: false, error: message});
};
