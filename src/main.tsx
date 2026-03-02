import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import posthog from 'posthog-js'
import * as Sentry from "@sentry/react";
import './index.css'
import App from './App.tsx'

// 1. Initialize PostHog FIRST (required for Sentry integration)
posthog.init('phc_vRUtKXaLgYpSzc9H4jOmN2fsc72gn39wsRDx0IZspxq', {
  api_host: 'https://us.i.posthog.com',
  session_recording: {
    maskAllInputs: true,
    blockClass: 'ph-no-capture',
  },
  enable_recording_console_log: true,
})

// 2. Initialize Sentry with PostHog integration + native replay
Sentry.init({
  dsn: "https://b6775a2c93348d29b14dc4548adcb722@o4510787448143872.ingest.us.sentry.io/4510787451289600",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
    posthog.sentryIntegration({
      organization: 'edvana',
      projectId: 4510787451289600,
      severityAllowList: ['error', 'fatal'],
    }),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// Lazy-load PostHogProvider to avoid duplicate React instance issues
let PostHogProviderComponent: React.ComponentType<{ client: typeof posthog; children: React.ReactNode }> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = await import('posthog-js/react');
  PostHogProviderComponent = mod.PostHogProvider;
} catch (e) {
  console.warn('PostHogProvider failed to load, running without it:', e);
}

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  if (PostHogProviderComponent) {
    const Provider = PostHogProviderComponent;
    return <Provider client={posthog}>{children}</Provider>;
  }
  return <>{children}</>;
};
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Wrapper>
      <App />
    </Wrapper>
  </StrictMode>
)
