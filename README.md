# DaeBotJS

A Discord bot for tracking World of Warcraft Mythic+ progression with spec-specific filtering, character tracking, and automated data collection.

## Features

### 🔥 Core Features

- **Character Progression Tracking** - View M+ runs, gear scores, and raid progression for all your characters
- **Spec-Specific Run Filtering** - Filter M+ runs by specialization (Tank/Healer/DPS specs)
- **Character Image Generation** - Auto-generated character sheets with runs, gear, and stats
- **Database-Backed Storage** - Local SQLite database for historical run tracking
- **Accurate Spec Data** - Hybrid Raider.IO + Blizzard API integration for 100% accurate spec identification
- **Auto-Refresh System** - Messages automatically update when data changes
- **Manual Run Entry** - Add historical runs that are too old for APIs

### 📊 Data Sources

- **Raider.IO API** - M+ runs, scores, and progression data
- **Blizzard API** - Accurate per-run specialization data (optional)
- **Local Database** - Stores all runs with spec information for filtering

### 🎮 Commands

#### Character & Progression
- `/characters` - View all characters with M+ progression
- `/raid` - View raid progression across all difficulties
- `/weekly` - Track weekly M+ completion status

#### Data Collection
- `/collect-runs` - Manually collect recent or best runs
- `/load-best-runs` - Initial population with best runs per dungeon
- `/add-run` - Manually add a single historical run
- `/import-runs` - Bulk import runs from JSON file

#### Notes & Management
- `/notes` - Character-specific notes and reminders
- `/manage-characters` - Add/remove characters from tracking

## Setup

### Prerequisites

- Node.js 16.x or higher
- Discord Bot Token
- Raider.IO API access (free)
- Blizzard API credentials (optional, for accurate spec data)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/DaeBotJS.git
   cd DaeBotJS
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure the bot**

   Create `config.json`:
   ```json
   {
     "token": "YOUR_DISCORD_BOT_TOKEN",
     "clientId": "YOUR_DISCORD_CLIENT_ID",
     "guildId": "YOUR_DISCORD_GUILD_ID",
     "characters": ["Character1", "Character2", "Character3"],
     "realm": "thrall",
     "region": "us"
   }
   ```

4. **Set up Blizzard API (Optional but Recommended)**

   Create `.env` file:
   ```env
   BLIZZARD_CLIENT_ID=your_client_id
   BLIZZARD_CLIENT_SECRET=your_client_secret
   ```

   See [BLIZZARD_API_SETUP.md](BLIZZARD_API_SETUP.md) for detailed instructions.

5. **Deploy slash commands**
   ```bash
   node deploy-commands.js
   ```

6. **Start the bot**
   ```bash
   node main.js
   ```

## Updating the Bot

### Automatic Update & Restart

The easiest way to update your bot to the latest version:

1. **Run the update script:**
   ```bash
   update-and-restart.bat
   ```

This will automatically:
- Stop the current bot gracefully
- Backup your database
- Pull latest code from GitHub
- Install new dependencies
- Redeploy Discord slash commands
- Restart the bot

**What gets preserved:**
- Your `config.json` settings
- Your `.env` file
- Your database (`mythic_runs.db`)
- All your character data

**Note:** Local changes to these files are automatically stashed and restored.

### Manual Update

If you prefer to update manually:

1. Stop the bot (Ctrl+C)
2. Pull latest code: `git pull origin main`
3. Install dependencies: `npm install`
4. Redeploy commands: `node deploy-commands.js`
5. Start bot: `node main.js`

## Quick Start

### Initial Data Population

1. **Load your best runs:**
   ```
   /load-best-runs
   ```

2. **View your characters:**
   ```
   /characters
   ```

3. **Select a character and filter by spec:**
   - Click character from dropdown
   - Use spec dropdown to filter (e.g., "Blood", "Unholy", "Frost")

4. **Enable auto-sync** (optional):

   The bot will automatically collect new runs every hour. Make sure periodic sync is enabled in `main.js`.

## Documentation

- **[Database Feature Guide](DATABASE_FEATURE.md)** - Complete guide to the spec filtering feature
- **[Blizzard API Setup](BLIZZARD_API_SETUP.md)** - Set up accurate spec data (5 minutes)
- **[Initial Data Population](INITIAL_DATA_POPULATION.md)** - How to populate your database
- **[Manual Run Entry](MANUAL_RUN_ENTRY.md)** - Add historical runs manually

## Key Features Explained

### Spec-Specific Filtering

The bot uses a **hybrid approach** for accurate spec data:

1. **Raider.IO** provides all run data (best, recent, alternate)
2. **Blizzard API** provides accurate spec for each run (top ~16 runs)
3. **Smart matching** combines both sources
4. **Database storage** maintains historical spec accuracy

**Result:** Your best runs have 100% accurate spec data!

### Auto-Refresh

Messages with character data automatically refresh when:
- You refresh the data manually
- Periodic sync runs (hourly)
- You switch between characters/specs

No need to re-run commands - the data updates in place!

### Image Generation

Character sheets are auto-generated with:
- Gear score and item level
- Best M+ runs per dungeon
- Spec-filtered runs (when using dropdown)
- Compact, detailed, and comparison views

## Database

The bot uses SQLite for local storage:

- **Location:** `./data/mythic-runs.db`
- **Size:** ~1MB per 10,000 runs
- **Backup:** Automatic WAL mode for reliability
- **Schema:** See [DATABASE_FEATURE.md](DATABASE_FEATURE.md)

## Configuration

### Character Management

Add/remove characters via config.json or `/manage-characters` command:

```json
{
  "characters": ["Main", "Alt1", "Alt2"],
  "realm": "area-52",
  "region": "us"
}
```

### Periodic Sync

Enable hourly auto-collection in `main.js`:

```javascript
const { startPeriodicSync } = require('./services/periodic-sync');

client.once('ready', () => {
    startPeriodicSync();
});
```

## API Rate Limits

- **Raider.IO:** No official limit, bot includes 100ms delay between requests
- **Blizzard:** 36,000 requests/hour (100 requests/second) - well within limits

## Troubleshooting

### "No runs found for spec"

- Run `/load-best-runs` to populate the database
- Make sure you've done runs in that spec this season
- Check that Blizzard API is configured for accurate spec data

### "Database locked"

- SQLite is in WAL mode - this shouldn't happen
- Check that only one bot instance is running
- Restart the bot if needed

### "Blizzard API not configured"

- Set up `.env` file with credentials
- See [BLIZZARD_API_SETUP.md](BLIZZARD_API_SETUP.md)
- Bot works without it, but spec accuracy is lower

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details

## Support

For issues or questions:
- Open an issue on GitHub
- Check existing documentation in the `/docs` folder

## Credits

- **Raider.IO** - M+ run data and scores
- **Blizzard** - World of Warcraft API
- **Discord.js** - Discord bot framework

---

**Made for tracking World of Warcraft Mythic+ progression across multiple characters and specializations.**
