# Deployment

This starter is designed to run headlessly on a schedule. The agent performs one decision cycle per run, writes state locally, and exits. That makes deployment simple, but it also means one thing matters more than anything else: the state file has to persist between runs. Without that file, the agent will register again and lose budget history.

## Railway (recommended)

Railway is the simplest production path because it gives you scheduled execution, environment variables, logs, and a persistent volume in one place. Start by forking the repository on GitHub, then create a new Railway project from that fork. Railway will build the Node service automatically from the repo.

Next, set the environment variables in the Railway service settings. Required values are:

- `ZOOID_MCP_URL`: the zooidfund MCP endpoint. In most cases you should leave the repo default.
- `CDP_API_KEY_ID`: your Coinbase Developer Platform API key identifier.
- `CDP_API_KEY_SECRET`: the matching CDP API key secret.
- `CDP_WALLET_SECRET`: the CDP wallet secret used for signing operations.
- `CDP_ACCOUNT_NAME`: the freeform account name the starter resolves on every run.
- `OPENAI_API_KEY`: your OpenAI API key.
- `DRY_RUN`: use `true` for initial verification and `false` for live donations.
- `STATE_FILE_PATH`: set this to `/data/agent-state.json`.

`STATE_FILE_PATH` matters because Railway containers are ephemeral. The filesystem inside the container can disappear between deploys or restarts. The state file stores the zooidfund API key, wallet address linkage, budget counters, and category spacing history. If it is not on a persistent volume, the agent will behave like a fresh clone every time it starts.

Treat `.agent-state.json` or whatever path you configure via `STATE_FILE_PATH` as sensitive operational state. It contains the zooidfund API key along with budget and registration state, so it should be protected with the same care as `.env`.

After setting environment variables, attach a persistent volume and mount it at `/data`. The starter will then write its state file to `/data/agent-state.json` on every run. That single setting is what makes month rollover, daily caps, and one-time registration work correctly in production.

Then configure the schedule. Railway cron uses standard crontab syntax and runs in UTC. For example:

```txt
0 13 * * *
```

That means daily at `13:00 UTC`. If you want an hourly run, use `0 * * * *`. Railway’s minimum supported interval is 5 minutes, but for most agents a daily or twice-daily schedule is more appropriate. The starter is not meant to spam the platform.

For the first deploy, keep `DRY_RUN=true` and trigger a run manually or wait for the schedule. Watch Railway logs. A healthy first run should show persona loading, registration on first run, platform search, shortlist generation, scoring, and either a dry-run donation payload or a clear skip reason. If anything fails, the logs are concise enough to diagnose without needing a dashboard.

In normal use, a daily agent on Railway should land roughly in the `$5-10/month` range depending on how often you run it and how much idle overhead your account tier carries. The LLM and evidence access costs are separate from Railway hosting cost.

## GitHub Actions (alternative)

GitHub Actions is a workable alternative if you want the agent to live entirely inside a GitHub repo. The workflow file for this project lives at `.github/workflows/donate.yml`. The main extra work compared with Railway is state persistence, because GitHub runners are also ephemeral.

In this starter, the GitHub Actions workflow does not provide durable mutable persistence for `.agent-state.json`. That means GitHub Actions is best treated as a secondary path for manual or scheduled live runs, not the recommended production deployment path for agents that need persistent budget, registration, and category-spacing history. For production use, Railway with a persistent volume is the recommended path.

Set repository secrets for:

- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`
- `CDP_WALLET_SECRET`
- `CDP_ACCOUNT_NAME`
- `OPENAI_API_KEY`

You can keep `ZOOID_MCP_URL` in the workflow env block if you want the repo default, or move it to a secret as well. Set the workflow schedule in the cron field under `on.schedule`. GitHub Actions cron also uses UTC. One important caveat: scheduled workflows are not exact. During high load, GitHub may delay a run by several minutes.

Cost is usually favorable. Public repositories run free under GitHub’s normal policy, and private repositories get the included Actions minutes on most plans. For low-frequency scheduled runs, that is often enough.
