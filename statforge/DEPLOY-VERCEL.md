# Put StatForge on GitHub and Vercel

No Odds API key or database is required to deploy and use the normal research dashboard.

## Upload to GitHub

1. Extract `statforge-vercel-source.zip` on your computer.
2. Create a new GitHub repository, for example `statforge`.
3. Upload the contents of the extracted `statforge/` folder. `package.json`, `vercel.json`, `api/`, and `public/` must be at the repository root, not inside an extra nested folder.
4. Include the `data/` folder: it contains the NBA directory and dated fallback game histories used by the backend. Never upload real `.env` files or API keys.

With Git installed, you can use these commands from the extracted `statforge/` directory instead of browser upload. Replace the GitHub URL with your repository URL:

```sh
git init
git add .
git commit -m "Add StatForge with Vercel Functions"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/statforge.git
git push -u origin main
```

## Import into Vercel

1. Sign in at https://vercel.com and choose **Add New → Project**.
2. Import your `statforge` GitHub repository.
3. Select **Other** as the framework preset.
4. Keep the root directory at the repository root (`./`).
5. Use **Build Command:** `npm run build`.
6. Use **Output Directory:** `dist`.
7. Use **Node.js:** `24.x` (also declared in `package.json`).
8. Leave environment variables empty for normal no-key use.
9. Select **Deploy**.

`vercel.json` already declares the build/output settings, API routing, file inclusion and response headers. Vercel creates Node.js functions from the four files in `api/`. The dynamic game-log URL is rewritten to the player function. Static frontend files are built into `dist/` and served separately.

After deployment, verify:

- The home page shows **No API key required**.
- `/api/players` returns the player directory.
- Searching for a player loads game logs or their dated fallback snapshot.
- Entering a manual line updates the projection.
- Refreshing public Kalshi markets works when the upstream service is available.

## Optional sportsbook connection

Research, projections, manual lines and Kalshi's public feed work without a key. The app's closed **Optional sportsbook feeds** section supports temporary keys for DraftKings, FanDuel and Underdog via The Odds API.

If you later want a server-managed key, configure `THE_ODDS_API_KEY` in Vercel's project Environment Variables and redeploy. The existing private Sites login does not transfer to Vercel. Configure suitable Vercel deployment protection or app authentication before exposing a shared server key, otherwise visitors could use its request quota. Leave the variable unset if you do not need this feature.

## Local development

Use Node.js 24:

```sh
npm install
npm run dev
```

Visit `http://localhost:3000`. This command runs both the frontend and the same API handlers used by Vercel. To check the package:

```sh
npm test
npm run build
```

## Troubleshooting

- **404 for API routes:** confirm `api/` and `vercel.json` are in the repository root and the framework preset is Other.
- **Missing player data:** confirm `data/` was uploaded. `includeFiles` in `vercel.json` bundles it into the functions.
- **No public markets:** inspect Vercel function logs; upstream public feeds may be unavailable. Player research and manual lines still work.
- **Old UI after deployment:** reload once. Frontend assets have versioned URLs; the HTML is served without caching.
- **A player has no projection:** at least five historical games are required. Additional-player estimates are exploratory transfers, not player-specific validated models.

Official references:

- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/docs/project-configuration
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
