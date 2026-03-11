

## Plan: Corporate Dropdown, Education CTAs, and Pilot Button Fix

### Changes to `src/pages/Index.tsx`

#### 1. Header: Add "Corporate" dropdown + restore education sign-in links
- Replace "Book a Demo" nav CTA with **"Instructor Sign In"** button → navigates to `/instructor/auth`
- Replace the single "Login" text link with **"Student Sign In"** → navigates to `/auth`
- Add a **"Corporate"** dropdown menu (using the existing `DropdownMenu` component from `src/components/ui/dropdown-menu.tsx`) with two items:
  - **Events** → placeholder route `/corporate/events` (new page)
  - **Enterprise** → placeholder route `/corporate/enterprise` (new page)
- Keep "Join Session" and the section nav links as-is

#### 2. Hero CTAs: Restore education sign-in
- Replace "Book a Demo" primary CTA → **"Instructor Sign In"** → `/instructor/auth`
- Replace "See How It Works" secondary CTA → **"Student Sign In"** → `/auth`
- Keep "Book a Demo" accessible elsewhere (final CTA section, footer)

#### 3. Fix "Start a Pilot Conversation" button (white-on-white bug)
- Line ~810-817: The button uses `variant="outline"` with `border-primary-foreground/40 text-primary-foreground` — but it sits on a green gradient background where `primary-foreground` is white, making it invisible against a white card
- Fix: Change to `bg-white/20 text-white border-white/40 hover:bg-white/30` to ensure visible contrast on the green gradient background

### New Files

#### 4. `src/pages/CorporateEvents.tsx` — placeholder dashboard
- Simple page with header, "Events Dashboard — Coming Soon" messaging, and a back link to `/`

#### 5. `src/pages/CorporateEnterprise.tsx` — placeholder dashboard
- Simple page with header, "Enterprise Dashboard — Coming Soon" messaging, and a back link to `/`

#### 6. `src/App.tsx` — Add routes
- Add `/corporate/events` → `<CorporateEvents />`
- Add `/corporate/enterprise` → `<CorporateEnterprise />`

### Summary of Visual Changes
- Nav right side becomes: Join Session | Student Sign In | **Corporate ▾** | **Instructor Sign In** (primary button)
- Hero CTAs become: **Instructor Sign In** (primary) | **Student Sign In** (outline)
- "Start a Pilot Conversation" button gets proper white-on-green contrast

