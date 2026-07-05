/**
 * Central billing feature flags.
 *
 * Checkout and the Stripe billing portal are LIVE so instructors can register a
 * subscription and manage payment details. Usage ENFORCEMENT — the monthly
 * lecture-hour limits and the 75% / 100% warnings on the Free tier — is
 * intentionally held OFF until we flip this on.
 *
 * While enforcement is off:
 *   - No instructor is blocked or warned about hour limits.
 *   - Lecture minutes are still recorded silently (see LiveSessionControls) so
 *     the usage history is ready the moment enforcement is enabled.
 *
 * Flip BILLING_ENFORCEMENT_ENABLED to `true` to activate limits + warnings.
 */
export const BILLING_ENFORCEMENT_ENABLED = false;
