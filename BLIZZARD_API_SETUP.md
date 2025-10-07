# Blizzard API Setup for Accurate Spec Data

This guide explains how to set up Blizzard API credentials to get **100% accurate** spec data for your M+ runs.

## Why Use Blizzard API?

**Problem:** Raider.IO doesn't provide per-run spec information in their API.

**Solution:** Use Blizzard API to fetch spec data for runs.

**Hybrid Approach:**
- Raider.IO: Provides all runs (best, recent, etc.)
- Blizzard API: Provides accurate spec for top ~16 runs
- Fallback: Uses character's current active spec for other runs

**Result:** Most runs (especially your best runs) will have 100% accurate spec data!

## Getting Blizzard API Credentials

### Step 1: Create a Blizzard Developer Account

1. Go to https://develop.battle.net/
2. Sign in with your Battle.net account
3. Click "Get Started" or "Access APIs"

### Step 2: Create a Client

1. Click "Create Client" button
2. Fill out the form:
   - **Client Name**: `DaeBotJS` (or any name you prefer)
   - **Redirect URLs**: `http://localhost` (not used but required)
   - **Service URL**: Leave blank or use your Discord server URL
   - **Intended Use**: Select "Game Sites and Communities"
3. Click "Create"

### Step 3: Get Your Credentials

After creating the client, you'll see:
- **Client ID**: A long string like `abc123def456...`
- **Client Secret**: Click "Show" to reveal it

**⚠️ Important:** Keep your Client Secret private! Don't share it or commit it to git.

### Step 4: Add Credentials to Environment Variables

Create a `.env` file in your project root (if you don't have one):

```env
BLIZZARD_CLIENT_ID=your_client_id_here
BLIZZARD_CLIENT_SECRET=your_client_secret_here
```

**Or** set environment variables in your system:

**Windows (PowerShell):**
```powershell
$env:BLIZZARD_CLIENT_ID="your_client_id_here"
$env:BLIZZARD_CLIENT_SECRET="your_client_secret_here"
```

**Windows (Command Prompt):**
```cmd
set BLIZZARD_CLIENT_ID=your_client_id_here
set BLIZZARD_CLIENT_SECRET=your_client_secret_here
```

**Linux/Mac:**
```bash
export BLIZZARD_CLIENT_ID="your_client_id_here"
export BLIZZARD_CLIENT_SECRET="your_client_secret_here"
```

### Step 5: Install dotenv (if using .env file)

```bash
npm install dotenv
```

Then add to the top of your `main.js` or `index.js`:

```javascript
require('dotenv').config();
```

### Step 6: Restart Your Bot

Restart the bot to load the new environment variables.

## Verifying Setup

When you run a collection command, check the logs:

**With Blizzard API configured:**
```
✅ Blizzard API client configured for accurate spec data
```

**Without Blizzard API:**
```
⚠️ Blizzard API credentials not found - using fallback spec tagging (character active spec)
```

## Testing Accurate Spec Data

1. Run collection:
   ```
   /load-best-runs
   ```

2. Check logs for spec accuracy rate:
   ```
   INFO: Best runs collection complete for character
   {
     character: 'Daemourne',
     runs_added: 18,
     accurate_specs: 16,
     fallback_specs: 2,
     spec_accuracy_rate: '88.9%'
   }
   ```

3. View character in Discord:
   ```
   /characters
   ```
   Then select your character and filter by spec - you should see accurate data!

## How It Works

### Data Matching

The bot matches runs from Raider.IO with Blizzard API using:
- Dungeon name
- Mythic level
- Completion timestamp

When a match is found, Blizzard's spec data is used. Otherwise, it falls back to the character's current active spec.

### Coverage

**Accurate Spec Data (from Blizzard):**
- Best run per dungeon (~8-10 runs)
- Top alternate runs (~6-8 runs)
- **Total: ~16-18 runs with 100% accurate specs**

**Fallback Spec Data (estimated):**
- Recent runs beyond top 16
- Runs from other specs not in top 16

### Spec Accuracy Rate

After collection, you'll see something like:
```
spec_accuracy_rate: '85.0%'
```

This means:
- 85% of runs have verified accurate spec from Blizzard
- 15% use fallback (character's current spec)

**For most players:** Best runs (which you care about most) will be 100% accurate!

## Without Blizzard API

If you don't configure Blizzard API, the bot still works but:
- All runs are tagged with character's current active spec
- Less accurate for multi-spec players
- Still useful for single-spec players

**Recommendation:** Set up Blizzard API for best results!

## Troubleshooting

### "OAuth failed: 401 Unauthorized"

- Check that Client ID and Client Secret are correct
- Make sure there are no extra spaces in your .env file
- Try creating a new client on Blizzard developer portal

### "Blizzard API credentials not found"

- Verify environment variables are set: `echo $env:BLIZZARD_CLIENT_ID` (PowerShell)
- Make sure you restarted the bot after setting variables
- If using .env, make sure `require('dotenv').config()` is at the top of main.js

### "No Blizzard season profile found"

- Character may not have any M+ runs this season
- Character name or realm might be incorrect
- Try a different character to verify credentials work

### Low spec accuracy rate

This is normal! Blizzard API only returns top ~16 runs. If you're collecting 50+ recent runs, only the top ones will have accurate specs.

**Solution:** Focus on best runs collection (`/load-best-runs`) for highest accuracy.

## Rate Limits

Blizzard API has generous rate limits:
- 36,000 requests per hour
- 100 requests per second

The bot:
- Caches OAuth tokens for 1 hour
- Makes 1 request per character per collection
- Well within limits even for large rosters

## Security Best Practices

1. **Never commit credentials to git**
   - Add `.env` to `.gitignore`
   - Use environment variables in production

2. **Regenerate if exposed**
   - If you accidentally expose credentials, regenerate them immediately
   - Go to https://develop.battle.net/ → Your Client → Regenerate Secret

3. **Use restrictive permissions**
   - Only give bot access to what it needs
   - Blizzard credentials should only be on the bot server

## Season Updates

When a new Mythic+ season starts, update the season ID:

**File:** `services/blizzard-client.js`

```javascript
// Update this constant at the top of the file
const CURRENT_BLIZZARD_SEASON = 15; // Change to new season ID
```

**How to find the current season ID:**
1. Go to https://develop.battle.net/documentation/world-of-warcraft/game-data-apis
2. Look at the Mythic Keystone Season API
3. Or check your character's profile API response

**Season History:**
- Season 13: TWW Season 2
- Season 14: TWW Season 2.5
- Season 15: TWW Season 3 (current)

After updating, restart the bot for changes to take effect.

---

**Created:** 2025-01-14
**Updated:** 2025-01-14
**Status:** Production Ready
**Required:** Optional (fallback works without it)
**Recommended:** Yes (for accurate spec data)
