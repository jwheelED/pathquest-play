import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx' // I kept this as .tsx to match your file
import { PostHogProvider } from 'posthog-js/react'

const options = {
  api_host: 'https://us.i.posthog.com', // Change to 'https://eu.i.posthog.com' if in Europe
}

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