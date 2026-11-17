# Hearth Intake Desk (frontend)

React + [Astryx](https://github.com/meta/astryx) design system. Builds into `../public`, which `frontend/server.py` serves and proxies to the ADK agent.

```bash
cd frontend/web
npm install
npm run dev      # local dev; proxies /run and /apps to the live agent
npm run build    # writes ../public (commit it; the Cloud Run image serves it as-is)
```

Open with `?mock=1` to replay `public/mock/turns.json` without the agent.
