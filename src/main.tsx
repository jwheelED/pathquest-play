import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from "@sentry/react";
import posthog from 'posthog-js'
import './index.css'
import App from './App.tsx'
import { PostHogProvider } from 'posthog-js/react'

// Initialize Sentry FIRST — before any other code that could throw
Sentry.init({
  dsn: "https://b6775a2c93348d29b14dc4548adcb722@o4510787448143872.ingest.us.sentry.io/4510787451289600",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

const options = {
  api_host: 'https://us.i.posthog.com',
}

// Global unhandled error capture (PostHog)
window.onerror = (message, source, lineno, colno, error) => {
  posthog.capture('$exception', {
    $exception_message: String(message),
    $exception_source: source,
    $exception_lineno: lineno,
    $exception_colno: colno,
    $exception_stack_trace_raw: error?.stack,
  });
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  posthog.capture('$exception', {
    $exception_message: event.reason?.message || String(event.reason),
    $exception_type: 'UnhandledPromiseRejection',
    $exception_stack_trace_raw: event.reason?.stack,
  });
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostHogProvider 
      apiKey="phc_vRUtKXaLgYpSzc9H4jOmN2fsc72gn39wsRDx0IZspxq" 
      options={options}
    >
      <App />
    </PostHogProvider>
  </StrictMode>
)