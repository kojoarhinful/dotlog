# Self-hosting dotlog

## Local development

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm dev
```

Open http://localhost:5173 for the home page and `/log` for the app. Without
`BREVO_API_KEY`, sign-in codes print in the terminal. Local data lives under
`.wrangler/`.

Local development does not need the database ids. `pnpm dev` and
`wrangler dev --local` use Miniflare.

Run `pnpm build` and `pnpm typecheck` before pushing. `pnpm preview` runs the
production build in the Workers runtime.

## Deploy

Builds run on Cloudflare Workers Builds from the default branch, so a push
deploys.

1. Run `pnpm db:create` and keep the id it prints. If you use preview branches,
   run it again for `dotlog-preview`. Use the same id for both if you do not.
2. In the Worker's build settings, add `D1_DATABASE_ID` and
   `D1_PREVIEW_DATABASE_ID` as build variables. If they are missing, the build
   looks the ids up by database name (`dotlog`, `dotlog-preview`) with the
   Cloudflare credentials it already has.
3. Set the build command to `pnpm build`. It fills the placeholder ids in the
   generated config under `dist/` after Vite builds. Set the deploy commands to:

   ```sh
   pnpm wrangler deploy    # production
   pnpm wrangler preview   # non-production branches
   ```

4. Add `AUTH_URL`, `EMAIL_FROM`, and `BREVO_API_KEY` as Worker variables and
   secrets.

The tracked `wrangler.jsonc` stays free of your account ids.

## Deploying from your machine

Export the same ids first:

```sh
D1_DATABASE_ID=... D1_PREVIEW_DATABASE_ID=... pnpm run deploy
```
