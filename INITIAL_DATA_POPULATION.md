# Initial Data Population Guide

This guide explains how to populate your database with M+ run data for the first time, and how to backfill historical data.

## ⚡ Quick Start for Accurate Spec Data

**Highly Recommended:** Set up Blizzard API credentials for 100% accurate spec data on your best runs!

See **[BLIZZARD_API_SETUP.md](BLIZZARD_API_SETUP.md)** for a 5-minute setup guide.

**With Blizzard API:**
- ✅ Best runs: 100% accurate spec data
- ✅ Recent runs: ~80-90% accurate (top runs verified)
- ✅ Automatic fallback for older runs

**Without Blizzard API:**
- ⚠️ All runs tagged with character's current active spec
- ⚠️ Less accurate for multi-spec players
- ✅ Still works, just less precise

## Overview

There are two types of run data you can collect:

1. **Recent Runs** (`mythic_plus_recent_runs`): Last ~500 runs per character
2. **Best Runs** (`mythic_plus_best_runs` + `mythic_plus_alternate_runs`): Top runs per dungeon

## Initial Population (Recommended Steps)

### Step 1: Load Best Runs First

Start by loading the best runs for all your characters. This gives you the top runs per dungeon:

```
/collect-runs type:Best Runs (top per dungeon)
```

Or use the dedicated command:

```
/load-best-runs
```

**What this does:**
- Fetches the best run for each dungeon
- Also fetches alternate runs (additional high runs per dungeon)
- Usually adds 10-30 runs per character (depending on dungeons completed)
- Tagged with character's current active spec

### Step 2: Load Recent Runs for More Coverage

After best runs, load recent runs to fill in more historical data:

```
/collect-runs type:Recent Runs (last ~500)
```

**What this does:**
- Fetches up to ~500 most recent runs
- Includes runs that may not be "best" but provide spec coverage
- Helps capture runs done in different specs

### Step 3: Enable Periodic Sync

Make sure periodic sync is enabled in your `main.js` to keep the data fresh:

```javascript
const { startPeriodicSync } = require('./services/periodic-sync');

client.once('ready', () => {
    // ... existing code ...
    startPeriodicSync();
    logger.info('Periodic run sync enabled');
});
```

## Command Reference

### `/collect-runs`

General-purpose collection command with options:

**Options:**
- `type: Recent Runs` - Collects last ~500 runs per character (default)
- `type: Best Runs` - Collects best runs per dungeon + alternates

**Examples:**
```
/collect-runs
/collect-runs type:Recent Runs
/collect-runs type:Best Runs
```

### `/load-best-runs`

Dedicated command for loading best runs (for clarity):

**Options:**
- `character` - Optional: Load for specific character only

**Examples:**
```
/load-best-runs
/load-best-runs character:Daemourne
```

## Data Coverage Explained

### Best Runs (10-30 runs per character)
- **Best run per dungeon** (8 dungeons = 8 runs minimum)
- **Alternate runs** (2-3 additional runs per dungeon)
- Tagged with current active spec
- Great for initial population

### Recent Runs (~500 runs per character)
- Last ~500 runs in chronological order
- Includes all difficulty levels
- Tagged with current active spec
- Best for spec coverage if you switch specs often

## Spec Accuracy

### With Blizzard API (Recommended)

✅ **Accurate Spec Data** - The bot uses a hybrid approach:

1. Fetches runs from Raider.IO (all runs, coverage)
2. Fetches spec data from Blizzard API (top ~16 runs, accuracy)
3. Matches runs and uses Blizzard's spec when available
4. Falls back to character's current spec for other runs

**Result:** Your best runs (the ones you care about!) have 100% accurate spec data.

**Example Output:**
```
INFO: Best runs collection complete
{
  runs_added: 18,
  accurate_specs: 16,
  fallback_specs: 2,
  spec_accuracy_rate: '88.9%'
}
```

### Without Blizzard API (Fallback)

⚠️ **Estimated Spec Data** - Raider.IO doesn't provide per-run spec info:

- All runs are tagged with character's **current active spec** at collection time
- Less accurate for multi-spec players
- More accurate if you collect frequently (hourly sync)

**Workarounds:**
- Set up Blizzard API (5 minutes, see BLIZZARD_API_SETUP.md)
- Or switch specs and collect separately (see workflow below)

## Recommended Workflow

### For Single-Spec Players
1. `/load-best-runs` - Initial population
2. Enable periodic sync - Keeps data fresh with recent runs
3. Done!

### For Multi-Spec Players
1. **Switch to Spec 1** (e.g., Blood Death Knight)
2. `/load-best-runs` - Loads best runs tagged as Blood
3. **Switch to Spec 2** (e.g., Unholy Death Knight)
4. `/load-best-runs` - Loads best runs tagged as Unholy
5. **Switch to Spec 3** (e.g., Frost Death Knight)
6. `/load-best-runs` - Loads best runs tagged as Frost
7. Enable periodic sync - Updates as you play

**Note:** Duplicate runs are automatically skipped, so switching specs and re-running collection only adds new runs.

## Checking Your Data

After collection, view your data:

```
/characters
```

Then:
1. Select your character
2. Use the **spec dropdown** to filter by spec
3. Verify runs are showing for each spec

## Database Stats

All collection commands show database stats:
- Total characters tracked
- Total runs stored
- Database file size
- Latest run timestamp

## Troubleshooting

### "No runs found for spec"

**Causes:**
- You haven't collected runs while playing that spec
- The spec dropdown only shows specs with data

**Fix:**
1. Switch to that spec in-game
2. Run `/load-best-runs`
3. Runs will be tagged with current spec

### "Runs showing wrong spec"

**Causes:**
- Character switched spec between run completion and collection
- Runs are tagged with current active spec, not the spec used

**Fix:**
- This is a Raider.IO API limitation
- Collect runs frequently (hourly sync) to minimize drift
- Switch to each spec and collect separately (see workflow above)

## Performance Notes

**Collection Speed:**
- ~100ms delay between characters (API rate limiting)
- Best runs: 1-2 seconds per character
- Recent runs: 2-4 seconds per character
- 10 characters: ~20-40 seconds total

**Database Growth:**
- ~1MB per 10,000 runs
- Each character: 10-500 runs depending on collection type
- 10 characters with best runs: ~100-300 runs = negligible storage

## Next Steps

After initial population:
1. View characters with `/characters`
2. Test spec filtering with the dropdown
3. Let periodic sync run hourly to keep data fresh
4. Manually collect when you switch specs for accurate tagging

---

**Created:** 2025-01-14
**For:** Database-backed spec filtering feature
