<!-- coderabbit-ai-generated:v1 -->

# GTUverse

A Cloudflare-hosted study quiz application using Next.js, D1, R2, Vectorize, Workers AI and Workflows.

## Setup

Use Node.js 24 and run `npm ci`. Apply the local database schema with `npx wrangler d1 migrations apply gtuverse-db --local`. `npm run build` builds Next.js; `npx opennextjs-cloudflare build` generates the Cloudflare bundle. `npm run start` serves the Next.js UI, but API routes require Cloudflare bindings and are not functional in a plain Next.js server.

## Cloudflare deployment

Provision the D1 database, R2 bucket, and Vectorize index with 1024 dimensions and cosine distance. Create a Vectorize metadata index for `document_id` before inserting vectors. Replace the D1 database ID in `wrangler.jsonc` with the provisioned ID, check resource names and custom domains, and apply the migration remotely using `npx wrangler d1 migrations apply gtuverse-db --remote`. Configure `GOOGLE_AI_STUDIO_API_KEY` and/or `GROQ_API_KEY` as Wrangler secrets if those providers are desired. Workers AI, the specified model availability, document conversion, and provider quotas must be verified in the target account. Run `npm run deploy` after configuring the account.

The current identity is a random browser cookie, not a sign-in system. Clearing the cookie loses access to that browser's quizzes. Provision authentication and operational controls before offering the service publicly. The default database ID is a placeholder and is not deployable.
