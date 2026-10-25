# Lantern Lake smoke tests

A quick check to run before pushing an update. It starts a local copy of the game and server
(`harness.mjs`, with an empty in-memory database, so it never touches the real site or players),
then plays through the main features in a headless browser at desktop and phone sizes.

## Run it

Needs Node 22 or newer. One-time setup from the repo root:

```
npm i -D playwright
npx playwright install chromium
```

Then:

```
node tests/smoke.mjs
```

It prints a ✔ or ✘ line per check and ends with `N/N passed`. The exit code is 1 if anything failed.

## What it covers

- Yard: old decor converts into place, dragging in Decorate yard, buying land, fishing off the dock
- Paths, fences and house paint, and that the visitor snapshot packs and unpacks them correctly
- Fruit trees, garden plots and the pantry
- Cabin: old wall spots carry over, crafting and arranging furniture, themes
- The “While you were away” summary fits on screen
- Photo mode hides the UI
- After Halloween: keepsakes only for owners, costumes in Settings
- Visiting a friend with broken data doesn’t crash
- Server: likes, the Yard of the Week board, random yard visits

Everything in this folder is for testing only. It isn’t part of the website and isn’t deployed.
