import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import posthog from 'posthog-js'
import './index.css'
import App from './App.tsx' // I kept this as .tsx to match your file
import { PostHogProvider } from 'posthog-js/react'

const options = {
  api_host: 'https://us.i.posthog.com', // Change to 'https://eu.i.posthog.com' if in Europe
}

// Global unhandled error capture
window.onerror = (message, source, lineno, colno, error) => {
  posthog.capture('$exception', {
    $exception_message: String(message),
    $exception_source: source,
    $exception_lineno: lineno,
    $exception_colno: colno,
    $exception_stack_trace_raw: error?.stack,
  });
};

// Unhandled promise rejection
window.onunhandledrejection = (event) => {
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