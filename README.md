# Shrimp Farm 🦐

A calm idle fish farm for your phone. No ads, no pop-up offers, no timers begging for attention —
just tanks, a conveyor, and a cooler that fills up while you're away.

## How it plays

- **Tanks** sit along a conveyor. Each one grows a species and sends packed trays down the
  belt into the **cooler** at the dock. You start with shrimp; later tanks unlock in order:
  Shrimp → Crayfish → Tilapia → Catfish → Rainbow Trout → Salmon → Sturgeon → Bluefin Tuna.
- **Upgrade** a tank to raise its income. Every tank doubles its income at levels
  10, 25, 50, 100, 150, 200, 300, 400 and 500.
- **Collect** empties the cooler into your cash. The cooler has a limit (2 hours of catch
  to start), so check in now and then.
- **Lab** research is permanent: Premium Feed (×1.2 income per level), Cold Storage
  (+2h cooler per level, up to 24h), Hatchery Deals (−5% upgrade costs per level).
- **Expand** (after $10B on one farm): sell the farm for **pearls**, each worth +10% income
  forever. Tanks and cash reset; research stays.
- Tap a tank to hand-feed it for a tiny bonus. Tap the cooler to collect. Drag to scroll.

### Exponential prices

Everything costs exponentially more as you buy it:

| Thing | Cost formula |
| --- | --- |
| Tank upgrade | `base × growth^(level−1)` with growth 1.16 (shrimp) up to 1.195 (tuna) |
| New tank | each tier costs roughly 70–90× the last |
| Premium Feed | `5K × 12^level` |
| Cold Storage | `2K × 10^level` |
| Hatchery Deals | `25K × 14^level` |

A simulated player who checks in every 4 hours reaches trout on day 2 and salmon around
day 3–4; sturgeon and tuna need a few expansions.

### Offline progress

The save stores the time you last had the game open. When you open it again (or switch
back to it), it works out the hours since then, multiplies by your income, and packs that
into the cooler — capped at the cooler's size — then shows a "Welcome back" summary. Live
play uses the exact same wall-clock math, so there's no difference between playing and
being away. Clocks that go backwards earn nothing.

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
| `js/economy.js` | All game math: species, costs, research, offline catch-up. No DOM — unit-tested. |
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
