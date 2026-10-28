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

Checks run two at a time (set `CONC=1` to run them one by one, or higher on a bigger machine). Checks that play real-time
minigames, walk characters around or use the shared push log run one at a time after the others, so they don't get flaky.

To run only some checks while working on a feature, pass words from their names:

```
node tests/smoke.mjs harvest save     # only checks with "harvest" or "save" in the name
```

Run the whole suite before every push.

## What it covers

- Yard: old decor converts into place, dragging in Decorate yard, buying land, fishing off the dock
- Paths, fences and house paint, and that the visitor snapshot packs and unpacks them correctly
- Fruit trees, garden plots and the pantry
- Cabin: old wall spots carry over, crafting and arranging furniture, themes
- Basement: its own colors and themes, furniture shared with upstairs, visitors can go downstairs
- Smokehouse: meals use the cheapest unlocked fish, give hunger and a boost, then cool down
- The “While you were away” summary fits on screen
- Photo mode hides the UI
- After Halloween: keepsakes only for owners, costumes in Settings
- Visiting a friend with broken data doesn’t crash
- Server: likes, the Yard of the Week board, random yard visits
- The yard button row: tucks away while you walk, camera views behind View
- Open House: three players at once (host, guest, phone guest) see each other walk and chat, invites, the phone More menu, remove, block, report, close
- Slots: cash prizes follow steady income and stop at the daily limit
- Basketball league: every playoff season finishes, so long-time saves still load
- Owner gifts: only the owner can send; coins scale with the player's steady income
- Deep Sea crate: Series 2 items of every kind open, equip and survive a reload
- Workbench: trade-up rules and daily legendary cap; decor upgrades and the visitor copy
- Moon: air runs out while away (unless you have the Moon Base)
- Casefile: case encounters aren't blocked by an old tournament card; next-weather forecast
- Case 5 (The 3:33 Broadcast): full play-through to the rewards
- Casefile shelf: folders open cases, back button, new-lead tags
- Crate Expectations landing page: four crates, your look, locker and odds from the main page
- Homestead: greenhouse, beehive, chicken coop and drying rack produce; bait gives a boost
- Hangouts: sit and roast at the fire pit, log a constellation, treehouse lookout, movie screen film
- Yard batch 3: horseshoes, putting, koi pond, statue, snowman
- Owner's Game Warden boat: draws, light bar toggles, shared with the live lake
- Supporter kit: the Mythic Lantern Keeper set is granted once, hung in the cabin, and can't be mailed
- Lantern Harbor town: two anglers see each other on the street and inside shops, Marge’s Counter sales, a round of darts, a Lake 7 song request, a Post Office parcel, the wishing fountain, the daily paper, trivia night, Leave returns home
- New menus: Map is the first tab with the lake map, Catch shows Cooler/Logbook/Collection, quick Sell, Hide phone, and the phone-size bottom bar opens and closes its sheet
- Harvest Festival: the season switch, the flannel gift, fall scenery at every water and the Harvest decor in the Shop
- Harvest Basket: the festival fish bite, giving fish from the cooler, the lake-wide total on the server and the tier rewards
- Save safety: a much smaller game can't replace a cloud save without confirming, earlier saves are kept and can be restored, and the owner can make a restore code
- App install (manifest, icons, service worker) and alerts: they arrive encrypted, never while you play, and respect each alert type's on/off switch

Everything in this folder is for testing only. It isn’t part of the website and isn’t deployed.
