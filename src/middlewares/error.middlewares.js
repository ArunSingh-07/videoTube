import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import jwt from "jsonwebtoken";

const errorHandler = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode =
      TokenExpiredError.statusCode || error instanceof mongoose.error
        ? 440
        : 500;
  }
  const message = error.message || "Something went wrong";
  error = new ApiError(statusCode, message, error?.errors || [], err.stack);

  const response = {
    ...error,
    message: error.message,
    ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}),
  };

  return res.status(error.statusCode).json(response);
};

export { errorHandler };
