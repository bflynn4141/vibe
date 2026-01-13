# Alpha Launch Handoff — For vibe-terminal Session

**Date:** January 12, 2026
**From:** vibe-platform/marketing session
**To:** vibe-terminal session

---

## What's Ready on vibe-platform

### Landing Page
- **URL:** `slashvibe.dev/alpha`
- **Features:**
  - Invite code entry form
  - Live stats (founders count, genesis spots, online now)
  - Waitlist signup for users without codes
  - Dark theme, Spirit design system

### APIs Built
| Endpoint | Purpose |
|----------|---------|
| `POST /api/alpha/validate` | Check if invite code is valid |
| `GET /api/alpha/download?code=XXX` | Download DMG (validates code first) |
| `POST /api/alpha/waitlist` | Join waitlist (email + optional twitter) |

### Invite Code System
- **Format:** `VIBE-{ADJECTIVE}-{NOUN}-{NUMBER}` (e.g., `VIBE-COSMIC-TERMINAL-042`)
- **Max uses per code:** 3 (allows re-download)
- **Storage:** Vercel KV at `vibe:alpha:codes`

### Generate Codes Script
```bash
cd ~/vibe-platform

# Generate 25 codes
node scripts/generate-invite-codes.js --count 25

# Generate code for specific user
node scripts/generate-invite-codes.js --for @eli_schein

# List all codes
node scripts/generate-invite-codes.js --list
```

---

## What vibe-terminal Needs to Do

### 1. Build the DMG
```bash
cd ~/vibe-terminal
pnpm build
pnpm tauri build
```

### 2. Copy DMG to vibe-platform
```bash
# Find the built DMG
ls src-tauri/target/release/bundle/dmg/

# Copy to vibe-platform downloads folder
cp src-tauri/target/release/bundle/dmg/Vibe_*.dmg ~/vibe-platform/public/downloads/vibe-alpha.dmg
```

### 3. Verify File Location
The download API expects the DMG at:
```
/Users/sethstudio1/vibe-platform/public/downloads/vibe-alpha.dmg
```

### 4. Test Locally (Optional)
```bash
cd ~/vibe-platform
vercel dev
# Open http://localhost:3000/alpha
# Try an invite code
```

---

## Deployment Order

1. **vibe-terminal:** Build DMG → copy to vibe-platform
2. **vibe-platform:** Deploy with DMG included
   ```bash
   cd ~/vibe-platform
   vercel --prod
   ```
3. **Generate codes:**
   ```bash
   node scripts/generate-invite-codes.js --count 25
   ```
4. **Send codes** to first 25 users

---

## First 25 Users (Active on /vibe)

| Handle | Building | Contact Method |
|--------|----------|----------------|
| @eli_schein | Apps & products | /vibe DM |
| @wanderingstan | Building something | /vibe DM |
| @surfcoderepeat | MCPs, crypto, AI | /vibe DM |
| @flynnjamm | Q+A network for Claude Code | /vibe DM |
| @fabianstelzer | glif.app | /vibe DM |
| @jiwa | Systems around art | /vibe DM |
| @bagholder | Anything and everything | /vibe DM |
| @klausblocks | Art and interactive software | /vibe DM |
| @ameesia | automata.art | /vibe DM |
| @pastelle | Generative art, iOS apps | /vibe DM |
| @jeres | Art etc | /vibe DM |
| @robviously | Transparent.city | /vibe DM |

Plus ~13 more from Seth's iMessage/WhatsApp/Discord contacts.

---

## DM Template for Invite

```
hey! you're one of the first people getting VIBE alpha access.

here's your code: VIBE-XXXXX-XXX

download at: slashvibe.dev/alpha

it's a native Mac app - social layer for Claude Code.
see who's building, message them, stay in flow.

you get 3 invites to share once you're in.

let me know what breaks!
```

---

## Success Metrics (First 24h)

| Metric | Target |
|--------|--------|
| Downloads | 25 |
| App opens | 15 |
| Messages sent | 10 |
| Bugs reported | <5 critical |

---

## File Structure

```
vibe-platform/
├── alpha.html                    # Landing page
├── api/
│   └── alpha/
│       ├── download.js          # DMG download (gated)
│       ├── validate.js          # Code validation
│       └── waitlist.js          # Waitlist signup
├── public/
│   └── downloads/
│       └── vibe-alpha.dmg       # ← PUT DMG HERE
└── scripts/
    └── generate-invite-codes.js # Code generator
```

---

## Contact

If issues, DM @seth on /vibe or check back with marketing session.

**Let's ship this.** 🚀
