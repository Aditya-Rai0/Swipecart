
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details: any;

  constructor(message: string, statusCode: number, isOperational: boolean = true, details: any = {}) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype); 
    Error.captureStackTrace(this, this.constructor);
  }
}

// 404 Not Found
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

// 400 Bad Request / Validation Error
export class ValidationError extends AppError {
  constructor(message: string = 'Invalid request data', details: any = {}) {
    super(message, 400, true, details);
  }
}

// 401 Unauthorized
export class AuthError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

// 403 Forbidden
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden access') {
    super(message, 403);
  }
}

// Rate Limit Error (If user exceeds API limits)
export class RateLimitError extends AppError{
    constructor(message = "Too many requests, please try again later"){
        super(message, 429);
    }
}