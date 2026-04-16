# Whiteboard App

Client and server for the WiteBoard collaborative canvas.

## Local Development

Create a frontend env file from `.env.example` if you want to override the default socket target.

```bash
cp .env.example .env.local
```

Optional server env values:

```bash
PORT=3001
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

Run the backend:

```bash
npm run server
```

Run the frontend:

```bash
npm run dev
```

## Production Notes

- Set `VITE_SOCKET_URL` when the frontend talks to a separate realtime server.
- Leave `VITE_SOCKET_URL` unset when the app is served behind the same origin and reverse-proxied to Socket.io.
- Set `CORS_ORIGIN` on the server to a comma-separated list of allowed frontend origins.
- Board data is written to `server/data` at runtime and is ignored by git.
