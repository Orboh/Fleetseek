/**
 * Global error handling middleware
 */

const config = require('../config');
const { ApiError, BadRequestError, ConflictError } = require('../utils/errors');

/**
 * Map common Postgres errors (SQLSTATE codes) to client-facing ApiErrors.
 *
 * Without this, constraint violations bubble up as generic 500
 * "Internal server error" — clients can't tell a permanently-invalid
 * request from a transient outage and retry forever
 * (e.g. experiences.visibility CHECK violation, customer report 2026-06-05).
 *
 * Only the constraint/column NAME is exposed — never err.detail, which can
 * contain the full failing row.
 *
 * @param {Error} err - Error thrown by node-pg
 * @returns {ApiError|null} Mapped error, or null if not a recognized pg error
 */
function mapDatabaseError(err) {
  if (!err || typeof err.code !== 'string') {
    return null;
  }

  switch (err.code) {
    case '23514': // check_violation
      return new BadRequestError(
        `Value violates constraint "${err.constraint || 'unknown'}"`,
        'CONSTRAINT_VIOLATION',
        'One of the provided fields has a value outside the allowed set. Check the API documentation for valid values.'
      );
    case '23505': // unique_violation
      return new ConflictError(
        `Duplicate value violates unique constraint "${err.constraint || 'unknown'}"`,
        'DUPLICATE'
      );
    case '23502': // not_null_violation
      return new BadRequestError(
        `Required field "${err.column || 'unknown'}" is missing`,
        'MISSING_FIELD'
      );
    case '23503': // foreign_key_violation
      return new BadRequestError(
        `Referenced record does not exist (constraint "${err.constraint || 'unknown'}")`,
        'INVALID_REFERENCE'
      );
    case '22P02': // invalid_text_representation (bad UUID, bad JSON, etc.)
      return new BadRequestError(
        'A field has an invalid format',
        'INVALID_FORMAT'
      );
    default:
      return null;
  }
}

/**
 * Not found handler
 * Catches requests to undefined routes
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    hint: `${req.method} ${req.path} does not exist. Check the API documentation.`
  });
}

/**
 * Global error handler
 * Must be registered last
 */
function errorHandler(err, req, res, next) {
  // Log error in development
  if (!config.isProduction) {
    console.error('Error:', err);
  }
  
  // Handle known API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Map recognized database errors to 4xx instead of generic 500
  const dbError = mapDatabaseError(err);
  if (dbError) {
    return res.status(dbError.statusCode).json(dbError.toJSON());
  }

  // Handle validation errors from express
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON body',
      hint: 'Check your request body is valid JSON'
    });
  }
  
  // Handle unexpected errors
  const statusCode = err.statusCode || err.status || 500;
  const message = config.isProduction 
    ? 'Internal server error' 
    : err.message;
  
  res.status(statusCode).json({
    success: false,
    error: message,
    hint: 'Please try again later'
  });
}

/**
 * Async handler wrapper
 * Catches promise rejections and forwards to error handler
 * 
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  notFoundHandler,
  errorHandler,
  asyncHandler,
  mapDatabaseError
};
