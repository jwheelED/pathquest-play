

## Plan: Events Marketing Sections + Event Creation Flow + Event Detail Screen

This is a large scope covering three distinct deliverables. Here is the breakdown:

---

### Part 1: Two Final Marketing Sections on CorporateEvents.tsx

**File:** `src/pages/CorporateEvents.tsx`

Add two sections between the Enterprise callout (Section 5) and the footer:

**Section 6 — "Built for Live Events"**
- Eyebrow + headline
- 4 cards in a `grid md:grid-cols-2` layout using `.landing-card`
- Cards: No prebuilt polls, Speaker stays in control, Participants join in seconds, Pricing that matches how events work

**Section 7 — Final CTA**
- Centered headline + subheadline
- Primary CTA: "Plan Your Event" (mailto link)
- Secondary CTA: "Talk to the Team" (mailto link, `.landing-secondary-btn`)
- Small muted supporting line below

No new files. Just additional JSX in the existing page.

---

### Part 2: 3-Step Event Creation Flow

This requires a new database table, a new page, and a new route.

**Database migration:**
```sql
CREATE TABLE public.scheduled_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration TEXT NOT NULL CHECK (duration IN ('1_hour', '2_hours', '4_hours', 'full_day')),
  expected_attendance INTEGER NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('self-serve', 'premium')),
  capacity_tier TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  join_method TEXT NOT NULL DEFAULT 'both' CHECK (join_method IN ('qr_only', 'code_only', 'both')),
  require_name BOOLEAN NOT NULL DEFAULT false,
  show_live_results BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ready', 'live', 'completed', 'cancelled')),
  session_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  org_id UUID REFERENCES organizations(id)
);

ALTER TABLE public.scheduled_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events" ON public.scheduled_events
  FOR SELECT TO authenticated USING (organizer_id = auth.uid());

CREATE POLICY "Users can insert own events" ON public.scheduled_events
  FOR INSERT TO authenticated WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "Users can update own events" ON public.scheduled_events
  FOR UPDATE TO authenticated USING (organizer_id = auth.uid());
```

**New file:** `src/pages/CreateEvent.tsx`
- Multi-step form (Steps 1-3) with local state, no external form library needed
- Step 1: Event basics (name, date picker, start time, duration dropdown, expected attendance)
- Step 2: Tier recommendation — uses pricing data to auto-recommend self-serve or premium based on attendance/duration. Two side-by-side cards, user can override
- Step 3: Join settings — join method radio, require name toggle, show live results toggle
- Right-side summary panel (sticky, updates live) showing event name, date, duration, tier, price
- On mobile, summary collapses to a bottom bar
- Final action: inserts into `scheduled_events` table, then navigates to event detail page
- "Confirm and Pay" for self-serve (initially just creates the record; Stripe integration is a separate task), "Submit for Review" for premium (mailto or record with status)

**New file:** `src/pages/EventDetail.tsx`
- Fetches event from `scheduled_events` by ID
- Top: event name, date/time, duration, capacity, status badge (Scheduled/Ready/Live)
- Center: large session code display + QR code (using a lightweight QR library or canvas-based generation) + participant join URL + copy button
- State-aware CTA:
  - Before ready window (>30 min before start): greyed "Start Live" with "Activates at X:XX PM"
  - During ready window (<=30 min before): emerald "Start Live" button
  - During live: "Session Live" with pulsing dot
- Lower section: event details summary + quick actions (Edit, Copy Link, Download QR, Cancel)
- Uses `useEffect` interval to check time against start time for state transitions

**Route changes in `src/App.tsx`:**
```
/events/create → <CreateEvent /> (protected, any authenticated role)
/events/:eventId → <EventDetail /> (protected)
```

**QR Code:** Use `qrcode` npm package (lightweight, generates data URL) rather than adding a heavy dependency.

---

### Summary of files

| File | Action |
|------|--------|
| `src/pages/CorporateEvents.tsx` | Add 2 marketing sections before footer |
| `src/pages/CreateEvent.tsx` | New — 3-step event creation wizard |
| `src/pages/EventDetail.tsx` | New — event detail/control screen |
| `src/App.tsx` | Add 2 new routes |
| Database migration | Create `scheduled_events` table with RLS |

