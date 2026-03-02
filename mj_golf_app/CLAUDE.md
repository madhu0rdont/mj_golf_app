# MJ Golf App

## Deployment
- **Railway** — deploy via `railway up` from the project root
- Project: `mjgolf`, Service: `mjgolf`, Environment: `production`
- Do NOT use Netlify or any other platform

## Post-Commit Workflow
After every commit and push:
1. **Deploy** — run `railway up` to deploy to production
2. **Update wiki** — push relevant changes to the wiki repo at `/private/tmp/mj_golf_wiki` (Architecture.md, Data-Models.md, etc.)
3. **Bump version** — update `package.json` version and `CHANGELOG.md` (at repo root `/Users/mj_ashe/Documents/CHANGELOG.md`) when a logical set of features is complete
