# HSR Damage Lab v0.5 — Team Finder & Combat Math Foundation

**This is an in-place update to HSR Damage Lab v0.4.1**, not a new app. The original home page, three-team benchmark, equipped Light Cone list, StarRailRes browser, and database sync are retained.

## Running the app

1. Extract the ZIP (do not open `index.html` directly from inside the ZIP).
2. Open `hsr-damage-lab/index.html` with a modern browser.
3. From **Home**, click **Team Calculator**.
4. Click **Open v0.5 Team Finder & Combat Math ↓** near the top of the calculator.
5. Select a scenario (burst, sustained, single target, AoE, Break, DoT, or follow-up). The app generates candidate four-character teams exclusively from your 67-character HoYoLAB snapshot.
6. Click **Use as comparison team** on candidates, or select characters manually in the three editable comparison rosters.
7. Configure the enemy level, resistance, DEF reduction, toughness state, and expected/CRIT/non-CRIT mode. Optional checkboxes assume particular support effects **are already active**; this release cannot cast or keep them active on a timeline.
8. Explore the **cumulative** or **per cycle** direct-hit reference graphs, click an event to view its damage factors, or export the reference simulation as JSON.
9. The **Full game-data catalog** still supports its original **Download & sync game database** button. It requires internet for the first download; or use `sync_catalog.ps1` on Windows to save it locally.

No game installation on Windows is needed; the included character and equipment information is from the user's previously provided HoYoLAB snapshot.

## Precisely what v0.5 adds

- A roster-constrained team candidate finder with 10 **curated composition templates**. This is a recommendation shortlist, **not a power ranking** and not an exhaustive enumeration of all valid teams. No fictitious synergy scores or full-battle DPS rankings are claimed.
- A separate, testable ordinary direct-hit damage kernel with ATK/HP/DEF scaling, expected/crit/non-crit branches, elemental DMG bonus, DEF reduction/ignore, RES PEN, vulnerability, and unbroken toughness mitigation.
- Snapshot-based parsing of the explicitly described **single-target first-hit Basic ATK scaling** for **66/67** character entries; Aeon ★ Aha's Elation Basic ATK is intentionally unsupported. Extra hits, triggered effects, and conditional attacks are excluded and flagged.
- Formula-level support for a **limited, audited subset** of character interactions, including Bronya's *unlocked* Military Might DMG aura, Asta's Ignite aura **only if unlocked** (it isn't unlocked on this snapshot), Acheron's The Abyss, and user-selected active states for Pela's Ultimate, Silver Wolf's Ultimate, and Ruan Mei's Skill/Ultimate (including E1). Ruan Mei E2 also applies a base-ATK-scaling buff in the reference when an enemy is marked broken. These effects are implemented as **assumed-active conditions**, not simulated applications, durations or uptime.
- An HSR action-value reference clock based on the snapshot's displayed SPD: first cycle 150 AV, later cycles 100 AV. This models only basic direct hits; it is **not** a gameplay-accurate turn engine.
- Three-comparison cumulative/per-cycle graph, event table, formula breakdown and JSON result export.
- Preserved original v0.2 normalized benchmark in Sections 1–4; new reference engine in Section 8.

## Exactly what v0.5 does NOT calculate

This is **not** a fully accurate HSR simulator, and **cannot identify your objectively strongest team** yet. Team numbers would be misleading if interpreted as DPS.

Not yet modeled: real Skill and Ultimate selection, rotations, SP and Energy, action advancement, enemy actions, buffs expiring, debuff application probability/Effect Hit Rate, specific Light Cone passives and conditional Relic bonuses, DoT/FUA/counter procs, Break/Super Break, memosprites, Elation, True DMG, damage caps, multi-target hit split, enemy waves, special endgame rules, RNG branches, or exact game-internal rounding. **The displayed original stats include already-equipped gear; static stats must not be added again.** Damage obtained from displayed stats is approximate to the game's hidden-precision calculation, even when the explicit conditional formula is mathematically correct.

**The direct-hit reference is a diagnostic tool for developing the real simulator, not a ranking metric.** A Break or Ultimate-focused team can have low Basic reference damage and still be substantially stronger in actual play.

## Source provenance and security

- Character snapshot: user-provided HoYoLAB character-detail JSON, including owned character stats, equipped builds, Trace text and Eidolons. `combat-data.js` is a simplified embedded snapshot containing public-like build information for offline testing. **Do not publish your personal export without reviewing it.**
- Catalog: [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes), `index_new/en` and `info.json`. User can sync current tables; the tool does not embed a complete upstream release by default. Upstream is licensed AGPL-3.0—review the license before redistribution and public hosting. This fan tool is unofficial and not affiliated with HoYoverse.
- Formula references: [KQM SRL](https://srl.keqingmains.com/combat-mechanics/damage/damage-formula) and [Prydwen](https://www.prydwen.gg/star-rail/guides/damage-formula).

The app makes no account API calls and does not handle credentials. Catalog synchronization fetches reference data from GitHub; all roster/build reference calculations run locally in your browser.

## Developer tests

With Node.js installed, run from the extracted project folder:

```bash
node test_catalog.js
node test_combat.js
node test_combat_ui.js
```

These test catalog JSON sync routes using a mocked network, damage-formula arithmetic, basic-hit parsing, select unlocked Traces/Eidolons, team uniqueness, action-value event ordering, and UI rendering logic using a DOM stub. An actual full browser interaction test was attempted but the testing environment blocked file and localhost navigation, so no full Chromium-browser run is claimed.

## v0.6 milestones

1. Build explicitly programmed action definitions for each character, backed by level-specific numeric parameters, not regex-assumed mechanics.
2. Add an event-driven combat engine with SP, Energy, full turn advancement, skill and ultimate actions, effect triggers/durations/stacking, and target AI.
3. Program and validate every owned character's Eidolons, conditional Relic/Light Cone passives and specialized damage mechanisms in a versioned registry.
4. Validate results against reproducible in-game combat logs/observations; report unsupported effects, expected values, RNG distributions and confidence.
5. Only **after coverage and validation**, rank full-team damage and mode-specific performance, with transparent scenario assumptions and graphs.
