# Manual Run Entry Guide

This guide explains how to manually add historical M+ runs that are too old to be fetched from the Raider.IO API.

## Why Manual Entry?

Raider.IO API only provides:
- **Recent runs**: Last ~500 runs
- **Best runs**: Top runs per dungeon (current in their system)

If you have historical runs from previous weeks/months that you want to track, you can manually add them to the database.

## Two Methods

### Method 1: Single Run Entry (`/add-run`)

Best for adding 1-5 runs at a time.

### Method 2: Bulk Import (`/import-runs`)

Best for adding many runs at once (10+).

---

## Method 1: Single Run Entry

### Command: `/add-run`

Add one run at a time with a simple form.

**Required Fields:**
- `character` - Character name (e.g., "Daemourne")
- `dungeon` - Select from dropdown
- `level` - Keystone level (2-40)
- `spec` - Specialization name (e.g., "Blood", "Unholy")
- `result` - Timed (+1, +2, +3) or Depleted
- `date` - Date completed (YYYY-MM-DD or MM/DD/YYYY)
- `score` - Run score (REQUIRED - must be manually entered, no auto-calculation)

**Optional Fields:**
- `season` - Season identifier (defaults to current)

### Example Usage

```
/add-run
  character: Daemourne
  dungeon: The Dawnbreaker
  level: 15
  spec: Blood
  result: +2
  date: 2024-12-25
```

**Result:**
```
✅ Run Added Successfully

Character: Daemourne
Dungeon: The Dawnbreaker
Level: +15
Spec: Blood (TANK)
Result: Timed (+2)
Score: 225.0
Date: 12/25/2024
Season: season-tww-3
```

### Date Formats

Both formats work:
- `2024-12-25` (YYYY-MM-DD)
- `12/25/2024` (MM/DD/YYYY)

### Result Options

- `+1` - Timed with 1 upgrade (barely timed)
- `+2` - Timed with 2 upgrades (good timing)
- `+3` - Timed with 3 upgrades (excellent timing)
- `depleted` - Not timed

---

## Method 2: Bulk Import

### Command: `/import-runs`

Import many runs from a JSON file.

### Step 1: Get Template

```
/import-runs template
```

This downloads a `runs-template.json` file with examples.

### Step 2: Fill Template

Open the JSON file and add your runs:

```json
[
  {
    "character": "Daemourne",
    "dungeon": "The Dawnbreaker",
    "level": 15,
    "spec": "Blood",
    "result": "+2",
    "date": "2024-12-15",
    "score": 225.0
  },
  {
    "character": "Daemourne",
    "dungeon": "Ara-Kara, City of Echoes",
    "level": 14,
    "spec": "Unholy",
    "result": "+1",
    "date": "2024-12-14",
    "score": 285.5
  },
  {
    "character": "Daemonk",
    "dungeon": "Mists of Tirna Scithe",
    "level": 16,
    "spec": "Windwalker",
    "result": "depleted",
    "date": "2024-12-13",
    "score": 160.0
  }
]
```

### Step 3: Import File

```
/import-runs file
  (attach your JSON file)
```

**Result:**
```
✅ Run Import Complete

Summary:
• Total Runs: 25
• Successfully Added: 23
• Duplicates Skipped: 2
• Errors: 0
```

### JSON Format Reference

**Required Fields:**
```json
{
  "character": "CharacterName",
  "dungeon": "Dungeon Name",
  "level": 15,
  "spec": "Spec Name",
  "result": "+2",
  "date": "2024-12-15",
  "score": 280.5
}
```

**Note:** Score is REQUIRED and must be manually entered. Get accurate scores from Raider.IO or in-game sources.

**Other Optional Fields:**
```json
{
  "season": "season-tww-3",
  "realm": "thrall",
  "region": "us",
  "duration": 1800000,
  "affixes": ["Fortified", "Bursting", "Tyrannical"]
}
```

---

## Valid Dungeon Names

Season 3.5 TWW Dungeons:
- `Ara-Kara, City of Echoes`
- `Eco-Dome Al'dani`
- `Halls of Atonement`
- `The Dawnbreaker`
- `Priory of the Sacred Flame`
- `Operation: Floodgate`
- `Tazavesh: So'leah's Gambit`
- `Tazavesh: Streets of Wonder`

**Note:** Dungeon names must match exactly (case-sensitive).

---

## Valid Spec Names

### Death Knight
- Blood, Frost, Unholy

### Demon Hunter
- Havoc, Vengeance

### Druid
- Balance, Feral, Guardian, Restoration

### Evoker
- Devastation, Preservation, Augmentation

### Hunter
- Beast Mastery, Marksmanship, Survival

### Mage
- Arcane, Fire, Frost

### Monk
- Brewmaster, Windwalker, Mistweaver

### Paladin
- Holy, Protection, Retribution

### Priest
- Discipline, Holy, Shadow

### Rogue
- Assassination, Outlaw, Subtlety

### Shaman
- Elemental, Enhancement, Restoration

### Warlock
- Affliction, Demonology, Destruction

### Warrior
- Arms, Fury, Protection

---

## Finding Run Scores

The `score` field is REQUIRED and must be manually entered. You can find accurate run scores from:

### 1. Raider.IO Website
- Go to your character's profile on Raider.IO
- View your run history
- Each run displays its score

### 2. In-Game Details! Addon
- View your Mythic+ run history in Details!
- Scores are shown for each completed run

### 3. In-Game Mythic+ Tab
- Open your Mythic+ tab (Shift+J)
- View run history for scores

**Note:** Do not estimate or calculate scores manually. Use actual scores from these sources for accurate tracking.

---

## Duplicate Detection

Runs are unique by:
- Character ID
- Keystone run ID (null for manual entries)
- Completed timestamp

**Same dungeon, level, and date = duplicate = skipped**

This prevents accidentally adding the same run twice.

---

## Tips for Bulk Import

### 1. Export from Raider.IO Profile

If you have old Raider.IO data, you can structure it as JSON:

1. Go to your Raider.IO profile
2. Look at old runs (even if not in API)
3. Copy data into template format

### 2. Use Spreadsheet

Create runs in Excel/Google Sheets, then convert to JSON:

| character | dungeon | level | spec | result | date |
|-----------|---------|-------|------|--------|------|
| Daemourne | The Dawnbreaker | 15 | Blood | +2 | 2024-12-15 |

Tools like https://www.convertcsv.com/csv-to-json.htm can convert CSV to JSON.

### 3. Start Small

Test with 2-3 runs first to make sure the format is correct, then add the rest.

---

## Common Issues

### "Invalid date format"

**Problem:** Date is not recognized

**Solution:** Use `YYYY-MM-DD` format: `2024-12-15`

### "Missing required fields"

**Problem:** JSON is missing character, dungeon, level, spec, result, or date

**Solution:** Check each run has all required fields

### "Invalid JSON format"

**Problem:** JSON syntax error (missing comma, bracket, quote)

**Solution:** Use a JSON validator like https://jsonlint.com/

### "Duplicates Skipped"

**Problem:** Run already exists in database

**Solution:** This is normal! The system prevents duplicate entries. If you see this, the run was already in the database.

---

## Viewing Manual Runs

After adding runs, view them normally:

```
/characters
```

Then:
1. Select your character
2. Use spec dropdown to filter
3. Manual runs appear alongside API runs

---

## Example Workflow: Importing Last Season's Runs

Let's say you want to add your best runs from last season:

### Step 1: Get Template
```
/import-runs template
```

### Step 2: Look at Old Data

Check your Raider.IO profile, Details! addon, or screenshots for runs you want to add.

### Step 3: Fill Template

```json
[
  {
    "character": "Daemourne",
    "dungeon": "The Dawnbreaker",
    "level": 18,
    "spec": "Blood",
    "result": "+2",
    "date": "2024-11-15",
    "score": 270.0,
    "season": "season-tww-2"
  },
  {
    "character": "Daemourne",
    "dungeon": "Ara-Kara, City of Echoes",
    "level": 17,
    "spec": "Blood",
    "result": "+3",
    "date": "2024-11-10",
    "score": 255.0,
    "season": "season-tww-2"
  }
]
```

### Step 4: Import
```
/import-runs file
  (attach JSON)
```

### Step 5: Verify

```
/characters
→ Select Daemourne
→ Filter by Blood spec
→ See all runs including manual entries
```

---

## Best Practices

1. **Add runs in chronological order** (oldest first) for better organization
2. **Include season** for historical tracking
3. **Be accurate with specs** - this is the whole point!
4. **Test with 1-2 runs** before bulk importing
5. **Keep your JSON file** as a backup

---

## Limitations

Manual runs have:
- ✅ Full spec accuracy (you specify it!)
- ✅ Full filtering support
- ✅ Display in character views
- ❌ No Raider.IO run ID
- ❌ No duration data (unless you add it)
- ❌ No affix data (unless you add it)

But for **spec filtering** (the main goal), manual runs work perfectly!

---

**Created:** 2025-01-14
**Commands:** `/add-run`, `/import-runs`
**Use Case:** Historical data entry for complete spec coverage
