# Mgła — Private P2P Space

An educational human-computer interaction (HCI) project. Built with React + Vite, Go (standard library), and WebRTC DataChannel. The visual design is based on the dark desktop prototype of Mgła from the provided Figma mockup: sidebar navigation, purple accent, prominent connect button, network states, and settings. The interface is available in Russian, English, and Polish, and adapted for mobile devices. The language switcher is located in the top bar; your selection is saved in localStorage (`mgla-language`). Dates, labels, help text, and error messages are translated, while user-generated content remains unchanged.

## Getting Started

Requires Node.js 20.19+ or 22.12+ and Go 1.22+.

```sh
npm ci
npm run dev
```

In a second terminal, from the project root:

```sh
cd server
MGLA_ALLOWED_ORIGIN=http://127.0.0.1:5173 MGLA_ADMIN_TOKEN='your-long-random-developer-key-at-least-32-chars' go run .
```

Open http://127.0.0.1:5173. The API uses `127.0.0.1:8089` by default. The `MGLA_ADDR` environment variable changes the API address; update `vite.config.js` if the port is changed. The allowed origin must match the page origin exactly. For developer access: navigate to "Support → Developer sign-in" and enter the `MGLA_ADMIN_TOKEN` value. The developer key is not included in the client build and is not stored by the browser.

## Production Build

```sh
npm run build
cd server
MGLA_ADMIN_TOKEN='your-long-random-developer-key-at-least-32-chars' go run .
```

Open http://127.0.0.1:8089. Go serves `../dist` and the API from the same address, so `MGLA_ALLOWED_ORIGIN` is not required. The server must be run from the `server` directory. For public deployment, use an HTTPS reverse proxy and your own server infrastructure; the application is not automatically published. Do not use the demo key from the test run in a public environment.

## Testing

```sh
npm run build
cd server
go test -race ./...
go vet ./...
```

The tests verify user isolation, developer permissions, the full ticket lifecycle, saving/rollback on write errors, the absence of keys in stored data, and room signal routing.

## Demo Walkthrough

1. In one browser, connect to the network and create a room after acknowledging the WebRTC notice.
2. Open the site in a second browser or a private window. Tabs sharing the same profile on the same address use the same key and are treated as the same participant.
3. Connect and join using the room code. Once "P2P channel open" appears, send messages and files up to 5 MB. Received files are downloaded only when clicked by the user.
4. Create a ticket. In the developer panel, take it into work and reply. Switch back to user mode, close the ticket, rate the support, or reopen it.
5. Save your user key in Settings; it allows you to access your tickets from another device.

By default, no ICE servers are used: P2P is intended for local networks. You can specify `VITE_STUN_URL` during startup or build (the STUN service discovers your public IP). TURN with temporary credentials and relay mode for restrictive networks are not included in the current version. Do not expect it to work across arbitrary NAT configurations.

## Privacy and Limitations

This is a pseudonymous prototype, not an anonymizing overlay network like Tor. There is no onion routing, IP masking, or protection against traffic correlation. WebRTC encrypts the channel, but your peer can discover your IP address, and the server sees the network addresses of connections. The discovery server is centralized; message content and files do not pass through it.

The user key consists of 256 random bits stored in localStorage. On the server, tickets are associated with the SHA-256 hash of the key; the key itself is never stored. Message history and files reside in page memory and are lost upon leaving or reloading. Tickets, replies, and ratings are stored in `server/data/tickets.json` (permissions 0600) and are accessible to the developer. Enable disk encryption and backups for real-world deployments. There is no email recovery for keys. Support is not an end-to-end encrypted channel.

Presence expires after 20 seconds without a heartbeat; rooms accommodate two participants. A single Go process and a JSON file are sufficient for an educational demo. A public service would require a proper database, rate limiting, ticket retention/deletion policies, and developer key management. Files received from peers are not scanned by an antivirus.

## Project Structure

- `src/main.jsx` — screens, tickets, developer panel, help, settings.
- `src/usePeer.js` — signaling, WebRTC, messaging, file transfer.
- `src/style.css` — responsive theme and UI states.
- `server/main.go` — API, presence, rooms, authentication, ticket storage.
- `server/main_test.go` — server tests.
- `docs/HCI.md` — interactions, states, accessibility, project defense scenarios.
