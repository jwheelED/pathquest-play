# Automatically refresh Edvana updates

## Change
- Remove the “Update Available” message and Refresh button.
- Automatically reload the current page when either the version check or service worker detects a newer release.
- Keep the one-time guard so a single update cannot trigger repeated refreshes.

## Verification
- Confirm the app builds cleanly and the update hook no longer displays a notification.
