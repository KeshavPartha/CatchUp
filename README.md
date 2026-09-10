# CatchUp

CatchUp is a streaming-platform prototype that helps people return to shows with context while keeping viewing history private by default.

The current foundation includes:

- A controlled local catalog with two fictional shows, seasons, episodes, and demo movies
- Browse, search, detail, My List, likes, and profile flows
- Supabase email authentication and user-owned data
- Episode playback simulation with persisted position, completion, and Continue Watching
- A Netflix-style dark browsing experience rebranded for CatchUp

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The local catalog works without external content API credentials. Configure Supabase to enable accounts and durable progress, then run [supabase-schema.sql](./supabase-schema.sql) in the Supabase SQL editor.

## Documentation

- [Product vision](./docs/PRODUCT_VISION.md)
- [Current architecture](./docs/CURRENT_ARCHITECTURE.md)
- [Product specification](./docs/PRODUCT_SPEC.md)
- [Architecture specification](./docs/ARCHITECTURE.md)
- [Database specification](./docs/DATABASE.md)
- [AI recap specification](./docs/AI_RECAP_SPEC.md)
- [Social specification](./docs/SOCIAL_SPEC.md)
- [Watch Together specification](./docs/WATCH_TOGETHER_SPEC.md)

## Git workflow

- `origin`: [KeshavPartha/CatchUp](https://github.com/KeshavPartha/CatchUp)
- `upstream`: [RutwikPatel13/netflix-clone](https://github.com/RutwikPatel13/netflix-clone)

## Attribution and license

The starter foundation is based on [RutwikPatel13/netflix-clone](https://github.com/RutwikPatel13/netflix-clone), attributed to Rutwik Patel and the original contributors. See [LICENSE](./LICENSE). This project is an independent educational prototype and is not affiliated with Netflix.
