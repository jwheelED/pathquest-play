// Conditional logging utility to prevent information leakage in production
const isDevelopment = import.meta.env.DEV;

export const logger = {
  error: (...args: any[]) => {
    if (isDevelopment) {
      console.error(...args);
    }
    // In production, errors should be sent to a monitoring service like Sentry
  },
  
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  }
};
