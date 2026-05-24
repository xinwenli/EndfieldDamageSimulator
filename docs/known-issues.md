# Known Issues

## Stat Precision vs. In-Game Display

**Symptom**: Some accumulated percentage stats (e.g. Ultimate Gain Efficiency) may differ from the game by ±0.1%.

**Cause**: The official wiki displays refinement values with 1 decimal place (e.g. `+33.4%`), but the game likely derives these values from a formula (e.g. `base × 1.3` at rank 3) resulting in higher internal precision (e.g. `33.41%` → displayed as `33.4%`). Our calculations use the wiki-displayed values, which can cause a ±0.1% discrepancy when multiple gear pieces are combined.

**Status**: Accepted limitation. Cannot be fixed without access to the game's exact internal refinement formulas.

## i18n / Multi-Language Wiki

The official wiki has two domains serving the same data in different languages:
- **CN**: `https://wiki.skland.com/endfield/catalog`
- **EN**: `https://wiki.skport.com/endfield`

Both use the same backend API (`zonai.skland.com`) with the same item IDs. The only difference is the UI language layer. When i18n support is added in the future.
