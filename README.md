# Student Schedule

A lightweight Hebrew RTL PWA for categories, recurring lessons/shifts, one-off events, reminders, holidays and notifications.

## Structure

- `index.html` — semantic markup and the tiny pre-paint theme bootstrap only
- `styles.css` — all UI styling
- `app.js` — application/auth/data/rendering logic
- `sw.js` — PWA shell cache and push notification handling
- `manifest.json` — install metadata

No build step is required. Run locally with:

```bash
py -m http.server 8000
```

Then open `http://localhost:8000`.
