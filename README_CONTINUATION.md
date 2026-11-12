# HSR Damage Lab — Dynamic Team Optimizer (v0.6.0-alpha)

An **additive overlay** to the existing [SoraOu/hsr-team-builder](https://github.com/SoraOu/hsr-team-builder) application. It preserves existing `index.html`, `combat-data.js`, `roster.json`, `combat-engine.js`, the Team Calculator, and account data. It is a **research prototype**, not an accurate endgame tier list or a complete game simulator.

## What this continuation actually does

Recovered and improved the seven-character engine from the continuation transcript:

- Character kits: Jing Yuan, Sunday, Bronya, Sparkle (**account's revised kit only**), Robin, Fu Xuan, Gallagher; partial equipment registry.
- Expected-value direct-hit damage, DEF/RES/CRIT, modifier sources, duration/stacking, SP and Energy, AV clocks, Lightning-Lord, Robin's Concerto.
- Dynamic-source CRIT DMG buffers, SP spend/refund/Basic ATK gain, turn-start hooks, `endOf`/extended expiry, Sunday advancing both Jing Yuan and Lightning-Lord, and Robin's passive-energy trigger.
- Enumeration of **all 20 four-character teams containing Jing Yuan** within this 7-character supported pool (7 choose 4 gives 35 unrestricted teams). **No team templates or arbitrary synergy scores.**
- Bounded search over Skill targets, Ultimate targets, SP reservation and Ultimate timing; all evaluations use simulator outcomes, not hand-rated team coefficients.
- Scenario controls for cycles and enemy count; browser graph/table, explanations, action log, source-event breakdown and JSON export.
- 17 regression tests using synthetic account panels. These establish implementation invariants, **not in-game numeric accuracy**.

## Install on Windows (copy the files into your existing repo)

1. Unzip the continuation ZIP into the **root of the existing repository**, alongside `index.html` and `combat-data.js`. Preserve existing files. The ZIP contains only added `engine/`, `tools/`, `tests/`, `optimizer.html`, `package.json`, and this README.
2. On Windows, you can run **`setup-windows.bat`** from inside the repository folder (it generates kit data, runs tests and opens the browser). Alternatively, in Command Prompt (`cmd`), run:

   ```bat
   cd /d "C:\Users\Admin\Desktop\JO things\Project\toda-sb"
   node tools\build-params.js
   node tests\run-tests.js
   node tools\run-optimizer.js --locked "Jing Yuan" --cycles 5 --budget 80
   ```

   Change the first line to your actual `hsr-team-builder` folder. `build-params.js` needs internet access to fetch the public [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes) JSON files. It generates **`engine/params.js`**, which is deliberately **not** faked or bundled with this archive. You can also supply a local source snapshot:

   ```bat
   node tools\build-params.js --local "C:\path\to\StarRailRes\index_new\en"
   ```

3. Open `optimizer.html` in your browser (or use a small local HTTP server if your browser limits local scripts). You can optionally add a reversible link to your existing home page:

   ```bat
   node tools\link-optimizer.js
   ```

   This saves an `index.html.optimizer.bak` backup and inserts one navigation link. It **does not replace your old calculator**.
4. The command-line runner writes `team-optimizer-results.json`. That JSON includes all tested teams, target/SP policies, actions and damage events.

## Important status, blockers and limitations

**No production-ready ranking claim.** The current engine deliberately excludes enemy attacks, damage taken, survival, weakness-break damage, super break, DoT, enemy HP, random targeting distributions, many Eidolons/Traces, and several conditional equipment effects. The engine uses a simple independent expected-hit assumption in multi-target scenarios. Buff/status timing still needs in-game verification; game-internal rounding has not been validated. Some mechanics (e.g. Bronya E1 SP proc) use an explicitly flagged deterministic approximation. Any saved result is labeled **partial**.

**Source version mismatches fail closed.** The original account `combat-data.js` contains old skill descriptions and equipped panels. When those descriptions don't match the generated versioned StarRailRes kit definitions, the loader throws an error rather than applying the wrong kit. Rerun the generator against the matching source revision or update the account snapshot. The generator records the source revision and SHA-256 hash.

**The rotation search is heuristic, not exhaustive.** The set of 20 supported Jing Yuan-centered teams is exhaustive, but the action/target selection search is a bounded coordinate search over parameterized policies. It can miss better turn-by-turn sequences. The simulation is for **expected damage only**, so sustainless teams are not penalized for dying in battle. Do not use the sorted output as an authoritative answer to the strongest in-game team.

**No test was run against the live account source files.** This environment cannot clone GitHub directly into its filesystem, and the user attached only the two transcripts. The copied code has been syntax-checked and tested against explicit test fixtures. Install the overlay in the actual repo and run the CLI to discover any snapshot-version integration issues. Do not push unverified generated data or claim numeric validation.

## Suggested next engineering milestone

- Fetch and freeze a compatible, versioned StarRailRes snapshot, then perform full account integration tests against the original `combat-data.js` and `equipped-light-cones.json`.
- Verify energy triggers, Sunday summon sequencing, Robin additional-damage triggers, all buff duration rules, basic/skill/Ultimate interactions, and alternative character investments with reproducible manual calculations or recorded in-game logs.
- Model enemy attacks /HP / Break / DoT / survival, followed by stochastic branches and endgame-specific encounter configurations.
- Improve the optimizer from fixed-target heuristics to event-by-event rollout/search with more robust full-population pruning and confidence intervals.
- Expand kit coverage and role metadata **only after** first-slice numerical validation succeeds.

## File inventory

```
engine/core.js             state, AV timeline, damage formula, SP/Energy/buffs
engine/kits.js             executable 7-character kits and equipment
engine/optimizer.js        unrestricted team generation + bounded policy search
engine/params.js           generated on user's computer; intentionally absent here
tools/build-params.js      StarRailRes data generator
tools/run-optimizer.js      CLI against actual account snapshot
tools/link-optimizer.js     optional reversible home page link
optimizer.html             additive browser UI with result charts and event inspection
tests/fixtures.js          explicitly synthetic panels
tests/run-tests.js         deterministic regression suite
package.json               convenience npm scripts
setup-windows.bat           one-click data generation, test, and browser launch
```

### Provenance

This release continues the supplied transcript from the last working `engine/core.js` and `engine/kits.js` sources; changes are independent and testable. The archived transcript's earlier high damage numbers were **not** treated as validated reference values, because the lost implementation had a real SP accounting defect.
