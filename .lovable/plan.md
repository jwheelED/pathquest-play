
# Fix Plan: Student Class Dashboard Error & Instructor Settings Navigation

## Issues Identified

### Issue 1: "Something Went Wrong" on Student Class Dashboard
The error boundary is catching an unhandled error when loading `/class/:instructorId`. Based on console logs and code review, there's a React warning: "Function components cannot be given refs." This suggests a component is receiving a ref it can't handle, possibly causing React's reconciliation to fail.

Looking at the `ClassDashboard.tsx` and `App.tsx`:
- The route `/class/:instructorId` renders `ClassDashboard` wrapped in `ProtectedRoute`
- The `ClassDashboard` uses several components that work fine elsewhere
- The actual error is likely coming from the component's async operations or child components

**Root Cause**: The ErrorBoundary in `ErrorBoundary.tsx` (line 160) is catching errors. The console logs show ref warnings for `Routes`, `Index`, and `StickyCtaBar` but these are warnings, not the crash cause. The actual crash is likely from an unhandled promise rejection in async functions within `ClassDashboard` or its child components (`AssignedContent`, `PreRecordedLectureList`).

### Issue 2: Settings Button Doesn't Navigate (URL changes but page doesn't)
The `InstructorLayout.tsx` architecture keeps the dashboard mounted but hidden when navigating away. The issue is that:

1. When on `/instructor/dashboard`, the layout shows the dashboard
2. When navigating to `/instructor/settings`, the URL changes
3. But the Outlet renders `<InstructorSettings />` which expects to be a full page
4. The dashboard is hidden with `hidden` class, but InstructorSettings renders in the Outlet

**Root Cause**: Looking at `App.tsx` line 112-113:
```tsx
<Route path="/instructor/dashboard" element={null} />
<Route path="/instructor/settings" element={<InstructorSettings />} />
```

The dashboard route has `element={null}` because the dashboard is rendered by `InstructorLayout` directly. However, the `InstructorSettings` is rendered via `<Outlet />` which should work. The issue is that `InstructorSettings.tsx` (lines 30-53) performs its own auth check and navigation:

```tsx
const checkAuth = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    navigate("/instructor/auth");  // This could be redirecting!
    return;
  }
  // ...
}
```

This redundant auth check inside `InstructorSettings` may be causing a redirect loop or conflict with the `ProtectedRoute` wrapper in `App.tsx`.

---

## Solution

### Fix 1: Student Class Dashboard - Add Error Handling to Async Operations

**File: `src/pages/ClassDashboard.tsx`**

Wrap async operations in try/catch to prevent unhandled promise rejections:

```typescript
const checkSession = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/");
    } else {
      setUser(session.user);
      await fetchUserProfile(session.user.id);
      if (instructorId) {
        await fetchCourseInfo(session.user.id, instructorId);
      }
    }
  } catch (error) {
    console.error("Error checking session:", error);
    // Don't crash - just show loading failed state
  } finally {
    setLoading(false);
  }
};

const fetchUserProfile = async (userId: string) => {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();
    
    if (data?.full_name) {
      setUserName(data.full_name);
    }
  } catch (error) {
    console.error("Error fetching user profile:", error);
  }
};
```

### Fix 2: Remove Redundant Auth Check from InstructorSettings

**File: `src/pages/InstructorSettings.tsx`**

The `InstructorSettings` page is already wrapped in `ProtectedRoute` via `App.tsx`. The redundant auth check inside the component causes conflicts. Remove the auth check and rely on the parent protection:

```typescript
export default function InstructorSettings() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [professorType, setProfessorType] = useState<"stem" | "humanities" | "medical" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Just fetch user and profile - auth is handled by ProtectedRoute
    const fetchUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("professor_type")
          .eq("id", session.user.id)
          .single();
        
        setCurrentUser(session.user);
        setProfessorType(profile?.professor_type || null);
      }
      setLoading(false);
    };
    
    fetchUserData();
  }, []);

  // ... rest of component
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ClassDashboard.tsx` | Add try/catch to `checkSession`, `fetchUserProfile`, and `fetchCourseInfo` |
| `src/pages/InstructorSettings.tsx` | Remove redundant auth check, keep only profile fetch |

---

## Technical Details

### ClassDashboard.tsx Changes

1. Wrap `checkSession` body in try/catch with finally block
2. Wrap `fetchUserProfile` in try/catch (already done for fetchCourseInfo)
3. Use `await` for sequential profile/course fetches to ensure proper error propagation

### InstructorSettings.tsx Changes

1. Remove the `checkAuth` function that navigates away
2. Replace with simple `fetchUserData` that only gets session and profile
3. Remove the role check (ProtectedRoute already does this)
4. Keep the loading state handling

This approach:
- Eliminates double auth checks that can cause redirect loops
- Properly handles async errors to prevent ErrorBoundary triggers
- Maintains the persistent dashboard architecture for recording state
