# StatForge

NBA player research with a charcoal/teal/amber dashboard, searchable player histories, manual prop lines, public Kalshi and Polymarket markets and a minutes × production prediction pipeline.

**No Odds API key is required for normal use.** Optional sportsbook connections are kept in a closed section.

**Start here:** [GitHub and Vercel deployment guide](DEPLOY-VERCEL.md).

## Run locally

Node.js 24 is supported. There are no required JavaScript runtime dependencies.

```sh
npm install
npm run dev
```

Then open `http://localhost:3000`.

```sh
npm test
npm run build
```

The build creates a static frontend in `dist/`; Vercel builds the backend from `api/*.js`. Python is not needed for deployment because the fitted model artifacts are included.

## Backend adapted to Vercel Functions

| Public endpoint | Vercel entry point | Purpose |
| --- | --- | --- |
| `GET /api/players` | `api/players.js` | Directory of 526 NBA players |
| `GET /api/players/:id/games` | `api/player.js`, via rewrite | Current/prior season game logs with dated fallback |
| `GET /api/props` | `api/props.js` | Public Kalshi and Polymarket markets; no paid-key requests |
| `POST /api/odds` | `api/odds.js` | Optional, manual single-game/stat sportsbook requests |

The backend uses standard Node.js file access for bundled snapshots, standard Fetch APIs for upstream data, and environment variables through `process.env`. It has no Cloudflare-specific runtime or Sites credentials. Shared logic lives outside the `api/` directory in `server/`.

## Source layout

- `public/`: frontend HTML/CSS/JS and public browser model/directory artifacts.
- `api/`: four Vercel Node.js function entry points.
- `server/`: shared source normalization, data loading, caches and request routing.
- `data/`: bundled roster and dated fallback histories, explicitly included in Vercel function bundles.
- `scripts/`: frontend build, local development server and optional Python data/model regeneration.
- `tests/`: Node.js tests for API behavior and artifact integrity.
- `vercel.json`: build, output, route rewrite, function duration and file-inclusion settings.

This export excludes the original hosting identity, Git metadata, account credentials, temporary files and installed packages. The existing hosted Site is unchanged by preparing this export.

## Data and model scope

The current directory covers 526 players across 30 NBA teams. Included current-season snapshots cover 4,104 player-game appearances; prior-season archives add context for players on the fetched prop board. All records originate from ESPN game logs/box scores. Dataset fetch times are included, and dated fallbacks are labeled when live retrieval fails. No forecasts are fabricated for players with insufficient history.

The fitted pipeline uses Ridge regression for minutes and Random Forest models for per-minute production, then 20,000 seeded Monte Carlo draws using paired chronological residuals. Separate models cover points, rebounds, assists, made threes and PRA. Historical charts and the manually supplied line remain separate from provider quotes.

The original training pool contains Stephen Curry, LeBron James and Nikola Jokić: 371 prior-season training rows, 236 chronological residual pairs and 30 current-season held-out games. Other players receive clearly labeled exploratory transfer estimates, not player-specific validated forecasts. Model settings, error, baseline error and small-sample limitations are available in the UI. Injury timelines and a live pregame availability feed are not connected.

Participation, minutes caps, rest, role, pace and usage settings are user assumptions. Absence is reported as a possible void, rather than counted as an under. Historical game-log filters do not retrain the model. The teammate UI is removed.

## Public and optional prop feeds

Kalshi uses its public API and requires no key. Thresholds such as 20+ are represented as over 19.5; contract ask prices are displayed in cents and are distinct from win probabilities. Verified in-play/finished games are excluded when schedule data is available; unverified starts are labeled.

DraftKings, FanDuel and Underdog are optional via The Odds API. Requests are manual and cached for five minutes within a warm function instance. Temporary keys stay in tab memory and are never saved in local storage or analyses. Provider quotas and rules remain distinct from the model output. Provider availability and API-key access depend on the external service.

## Optional data/model regeneration

Python dependencies are listed in `requirements.txt`. From the project root:

```sh
python -m pip install -r requirements.txt
python scripts/train-pipeline.py --cache work/cache
python scripts/refresh-league.py
node scripts/sync-data.mjs
npm run build
```

The included data/model artifacts are sufficient for deployment; regeneration is optional. Scripts currently target the 2026–27 NBA season. Update their season constants before moving to a future season. Live server queries are read-only; no database has been provisioned.

## Storage and access

Snapshots are read-only bundled files; caches are transient and saved analyses use browser-local storage. PostgreSQL remains the recommended next step for durable events, immutable quote history and versioned predictions, with raw response/model files in object storage.

Vercel access protection is separate from the previous Site's private access. See the deployment guide before adding a shared server-managed API key. No environment variable is required for normal use.

Polymarket also uses public endpoints without a key. StatForge discovers NBA events in the next 72 hours and reads both outcome order books for full-game points, rebounds, assists and three-pointer props. Started/finished games are excluded using provider start times and the NBA schedule. Quotes display asks, best bids and contracts available at the ask, excluding trading fees; missing asks remain blank. Discovery is capped at 100 events / 1,000 props per refresh, with partial coverage labeled. Public feeds refresh independently and are cached for 60 seconds. Source rules remain available on each row.

## Estimated EV rankings

`GET /api/ev` compares current Kalshi and Polymarket asks with each player’s smoothed current-season hit rates (Jeffreys Beta(0.5, 0.5); 10–40 appearances, at least one within seven days). It returns positive fee-adjusted estimates, sample sizes, and Wilson intervals for historical hit frequencies. The UI groups the highest estimated EV per player/stat, player, stat, or shows all positives. This separate historical estimator is not the three-player Ridge/Random Forest model and is not validated as a profitable forecasting system.

EV assumes participation and normal binary settlement at half-point lines, holding to settlement, and an order of up to 100 contracts limited by available size. Polymarket fee metadata and Kalshi series/event fee overrides determine entry-fee estimates. Missing fees/asks/size, started games, mismatched teams, insufficient samples, and quotes older than two minutes are excluded. ESPN live logs are preferred; snapshots must be under 24 hours old. The route has a 180-second limit, caches estimates for 60 seconds, and evaluates at most 80 players. No trading credentials or order placement are involved.
