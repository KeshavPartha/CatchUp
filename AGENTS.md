# CatchUp repository guidance

- The project is called CatchUp.
- Before major product or architectural changes, read `docs/PRODUCT_VISION.md` and all relevant specifications.
- Inspect existing code before changing architecture. Reuse existing components and patterns where reasonable.
- Make incremental, focused changes; avoid unrelated refactors.
- Keep TypeScript strict and avoid `any` unless clearly justified.
- Never hardcode API keys, secrets, URLs, or credentials. Keep secrets in environment variables.
- Preserve the MIT license and upstream attribution.
- Run relevant lint, typecheck, build, and tests after meaningful changes.
- Do not silently change behavior that conflicts with the specs. If implementation details conflict with a product spec, flag the conflict rather than inventing a product decision.
- Keep documentation updated when architecture or behavior materially changes.
- Prefer simple, maintainable implementations over unnecessary complexity.

## Git workflow

- Work in small logical checkpoints and commit meaningful, working milestones.
- Use clear, descriptive commit messages.
- Never push to GitHub unless explicitly asked.
- Do not rewrite Git history, force-push, or delete branches without explicit permission.
- Never commit secrets, `.env.local`, generated credentials, or sensitive files.
