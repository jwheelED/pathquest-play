# Roadmap

## Misconception-targeted auto questions (interval + misconception, fully automatic)
- [x] Interval generator scans the whole interval for the strongest misconception and builds a diagnostic question (each wrong choice = one named misconception)
- [x] Grace window: at the interval, wait (silently, retry every 30s) up to 2 min for a strong misconception; after that send the best grounded question so pacing holds
- [x] Auto questions always go straight to participants (never On Deck)
- [x] Misconception data (target + what each wrong choice means) saved with the question
- [x] Slide presenter auto questions keep the misconception choices instead of regenerating them
- [ ] Show "what each wrong choice means" on the instructor results card
