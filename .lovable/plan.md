

## Plan: Corporate Events Dashboard

### Overview

Replace the placeholder `CorporateEvents.tsx` with a fully functional events dashboard. Since there is no authentication requirement for corporate users yet, this will use local state and mock data to demonstrate the UI — ready to be wired to Supabase tables later.

### Page Structure

The dashboard reuses the existing `DashboardShell`-style layout pattern (sidebar nav + content area) seen in `InstructorDashboard.tsx`, adapted for an event organizer role.

**Top Header**: Edvana logo + "Back to Home" link (keep existing pattern)

**Sidebar Nav Tabs**:
- Overview (default) — summary metrics + upcoming events list
- Create Event — form to create/edit an event
- Schedule — calendar-style view of upcoming events
- Attendees — attendee list with search/filter
- Live Check-Ins — placeholder for running live understanding checks during events

### Section Details

#### 1. Overview Tab
- **Metrics row** (4 cards): Total Events, Upcoming Events, Total Attendees, Avg Attendance Rate
- **Upcoming Events table**: columns for Event Name, Date, Location/Format (In-person/Virtual/Hybrid), Registered Attendees, Status (Draft/Published/Live/Completed), Actions (Edit/Delete)
- **Recent Activity feed**: simple list of last 5 actions (e.g., "New registration for Workshop X")

#### 2. Create Event Tab
- Form fields: Event Title, Description (textarea), Date & Time (date picker + time input), Duration, Format (In-person/Virtual/Hybrid select), Location/Link, Max Attendees, Tags (multi-select chips: Workshop, Conference, Training, Keynote)
- Save as Draft / Publish buttons
- Uses existing `Input`, `Select`, `Button`, `Card`, `Calendar` components

#### 3. Schedule Tab
- List view grouped by month showing upcoming events as cards
- Each card: title, date/time, format badge, attendee count, status badge
- Filter by: All / This Week / This Month

#### 4. Attendees Tab
- **Search bar** at top
- **Table**: Name, Email, Events Registered, Last Attended, Status (Confirmed/Pending/Cancelled)
- **Add Attendee** button opens a simple dialog (name + email)
- Bulk actions: Export CSV (client-side), Send Reminder (placeholder toast)

#### 5. Live Check-Ins Tab
- Placeholder card explaining this will connect to Edvana's live understanding check system for events
- "Coming Soon" state with icon and description

### Data Model (Local State for Now)

All data lives in React state with mock seed data. Types:

```typescript
interface CorporateEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  duration: number;
  format: "in-person" | "virtual" | "hybrid";
  location: string;
  maxAttendees: number;
  registeredCount: number;
  status: "draft" | "published" | "live" | "completed";
  tags: string[];
}

interface Attendee {
  id: string;
  name: string;
  email: string;
  eventsRegistered: number;
  lastAttended: string | null;
  status: "confirmed" | "pending" | "cancelled";
}
```

### Files to Create/Edit

- **`src/pages/CorporateEvents.tsx`** — Full rewrite. Contains all tab content inline (single file, ~600-800 lines). Uses local state with mock data.

No new components, routes, or database changes needed. The existing route `/corporate/events` already exists in `App.tsx`.

### Design Notes
- Reuse existing UI components: `Card`, `Button`, `Input`, `Select`, `Table`, `Badge`, `Dialog`, `Calendar`, `Tabs`
- Match the clean style of the instructor dashboard
- Responsive: stack cards on mobile, table scrolls horizontally
- All actions produce `toast()` feedback

