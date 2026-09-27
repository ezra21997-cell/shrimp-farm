# Shrimp Farm 🦐

A calm idle fish farm for your phone. No ads, no pop-up offers, no timers begging for attention —
just tanks, a conveyor, and a cooler that fills up while you're away.

## How it plays

- **Tanks** sit along a conveyor. Each one grows a species and sends its catch down the
  belt one unit at a time (a shrimp, a crayfish, a tuna…) into the **cooler** at the dock.
  A unit is worth money only once it lands in the cooler; the tank card shows what each
  unit is worth and the tank's income per second. Higher levels send units faster (down to
  one every 1.2 s) and make each one worth more. Tanks further up the belt take longer to
  deliver. You start with shrimp; later tanks unlock in order:
  Shrimp → Crayfish → Tilapia → Catfish → Rainbow Trout → Salmon → Sturgeon → Bluefin Tuna.
- **Upgrade** a tank to raise its income. Every tank doubles its income at levels
  10, 25, 50, 100, 150, 200, 300, 400 and 500.
- **Collect** empties the cooler into your cash. The cooler has a limit (2 hours of catch
  to start), so check in now and then.
- **Lab** research is permanent: Premium Feed (×1.2 income per level), Cold Storage
  (+2h cooler per level, up to 24h), Hatchery Deals (−5% upgrade costs per level).
- **Expand** (after $870M on one farm): sell the farm for **pearls**, each worth +20% income
  forever. Pearls grow with the cube root of what the farm made (8× the earnings for 2× the pearls). Tanks and cash reset; research stays.
- Tap a tank to hand-feed it: it sends one bonus unit down the belt (paid when it lands). Tap the cooler to collect. Drag to scroll.

### Exponential prices

Everything costs exponentially more as you buy it:

| Thing | Cost formula |
| --- | --- |
| Tank upgrade | `base × growth^(level−1)` with growth 1.30 (shrimp) down to 1.22 (tuna) |
| New tank | each tier costs roughly 25–60× the last |
| Premium Feed | `130K × 8.6^level` |
| Cold Storage | `520 × 12^level` |
| Hatchery Deals | `150K × 4.5^level` |

Simulated players (with 8 hours of sleep a day, expanding when it pays) reach:

| Player | Crayfish | Tilapia | Catfish | Trout | Salmon | Sturgeon | Tuna | 1st expand |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Checks in hourly | 2h | 11h | day 2.3 | day 5.5 | day 13.6 | day 19.7 | day 25 | day 7.5 |
| Every 4 hours | 8h | day 1.2 | day 3.3 | day 6.2 | day 16.2 | day 24.2 | 30+ days | day 8.7 |

### Offline progress

The save stores the time you last had the game open, plus every unit still riding the
conveyor. When you open it again (or switch back to it), `tick()` in `js/economy.js` runs the
conveyor forward by the time you were away: each tank spawns units on a fixed schedule, each
unit takes `pathLength / BELT_SPEED` seconds to reach the cooler, and its value is added when
it lands — until the cooler is full, after which arriving units are lost. Units that both
spawn and land during the gap are counted in closed form, so days away cost the same as a
second. Then a "Welcome back" summary shows what was delivered.

Live play calls the exact same function every frame with the wall-clock time since the last
frame. The result is identical for any step size (the tests check one big step against
thousands of small ones), so there's no difference between playing and being away. Clocks
that go backwards earn nothing.

## Play it

**https://ezra21997-cell.github.io/shrimp-farm/**

Open that on your phone, then **Share → Add to Home Screen** (iPhone) or **⋮ → Install app**
(Android). It then opens full-screen like a normal app and works offline.

> On iPhone, add it to the Home Screen. Safari can clear saved data for websites you don't
> visit for a week, but installed home-screen apps keep theirs. For extra safety,
> **Farm → Export** gives you a backup code you can paste back with **Import**.

It's served by GitHub Pages straight from the `main` branch — push a change and it goes live
in a minute or two. Remember to bump `VERSION` in `sw.js` so installed copies update.

## Running locally

```sh
npm start      # serves on http://localhost:8080
npm test       # economy unit tests
```

## Code

| File | What's in it |
| --- | --- |
| `js/economy.js` | All game math: species, costs, research, the conveyor simulation, offline catch-up. No DOM — unit-tested. |
| `js/models.js` | Every 3D model (creatures, tanks, conveyor, cooler, trees). |
| `js/scene.js` | The three.js farm scene, animation, camera, tap picking. |
| `js/main.js` | Save/load, UI, touch controls, game loop. |
| `sw.js` | Offline cache. **Bump `VERSION` when you change files** so phones update. |
| `vendor/three.module.min.js` | three.js r169 (MIT), bundled so it works offline. |

### About the 3D models

All models are built in code from simple low-poly shapes (`js/models.js`) instead of
downloaded files. Free model packs rarely cover shrimp *and* crayfish *and* sturgeon in one
art style, and mixing packs looks patchy — building them the same way keeps everything
flat-shaded and consistent, and makes edits a one-line change: colors, sizes and proportions
are plain numbers at the top of each builder (e.g. `fish({ body: '#78909c', len: 0.95 … })`),
editable right in GitHub's web editor.

If you later want to drop in real `.glb` models (e.g. from Quaternius or Kenney, both CC0),
three.js's `GLTFLoader` can load them, and small edits (recolor, rescale, merge, compress)
can be done without Blender using [glTF-Transform](https://github.com/donmccurdy/glTF-Transform)
(`npx @gltf-transform/cli`) or in the browser at https://gltf.report.
