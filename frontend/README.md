# Nexory Peerly — Cosmic Connect

A responsive React + TypeScript frontend for discovering a peer, accepting a match, and chatting. The current application is an **explicitly labeled, browser-local demo**. It does not connect to Spring Boot, open a WebSocket, or transmit messages over WebRTC.

## Run locally

Use Node.js 22 or newer and pnpm. From the repository root:

```powershell
cd frontend
pnpm install
pnpm dev
```

Open the Local URL printed by Vite (normally http://127.0.0.1:5173). No backend, environment variables, account, or external image service is required. Fonts are bundled locally. `pnpm-workspace.yaml` allows esbuild's required installation script.

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm preview
```

Browser tests use locally installed Google Chrome via Playwright's `chrome` channel. If Chrome is unavailable, install it or change the channel in `playwright.config.ts` to an installed browser. Screenshots and failure traces are written to the ignored `test-results/` directory. Production output is `dist/`; configure the deployment host to serve `index.html` for client routes.

## Demo walkthrough

1. Open Discover, select interests and a discovery mode, then choose **Find a Match**. Searching takes about 2.2 seconds and can be cancelled.
2. Inspect Nova's profile and shared interests. Accept or skip the match. An unanswered match expires after 45 seconds.
3. Acceptance first waits for the simulated peer, then simulates opening a DataChannel. The chat route unlocks only when that stage completes.
4. Send messages with Enter or the send button; Shift+Enter inserts a newline. Nova sends centrally defined simulated replies. Messages render as text, with a 4,000-character limit.
5. Open connection details for explicitly marked mock diagnostics. End the conversation through the confirmation dialog to clear the local session.

The **Demo mode** button in the top bar exposes controlled scenarios:

- Successful direct or TURN relay simulation.
- Peer rejection, an 8-second remote acceptance timeout, connection failure, or discovery failure.
- During chat: connecting, direct, relay, reconnecting, disconnected, and failed connection states. Sending is disabled while unavailable; the draft is preserved. **Restore demo** simulates a recovered direct connection.
- Clear messages to inspect the empty chat state.

The profile avatar opens a guest display-name editor. All state is in memory and resets on reload. Interest-based discovery is only a UI preview; both discovery modes use the same mock profile, with selected interests used to highlight shared interests.

## Primary files

| File or directory                                | Responsibility                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`, `src/App.tsx`                    | App entry point, provider, and React Router routes                                                          |
| `src/components/layout/AppShell.tsx`             | Desktop/mobile navigation, guest profile and demo controls                                                  |
| `src/pages/Discover/DiscoverPage.tsx`            | Radar, preferences, searching and cancellation                                                              |
| `src/pages/Matches/MatchPage.tsx`                | Acceptance, rejection, expiry and connection failure                                                        |
| `src/pages/Chat/ChatPage.tsx`                    | Conversation, connection details, draft and ending flow                                                     |
| `src/components/`                                | Reusable avatars, radar, chips, match components, chat components, buttons, cards, native dialogs and toast |
| `src/services/demoSession.ts`                    | Isolated, observable demo state machine; owns and cleans up timers                                          |
| `src/services/mockData.ts`                       | Demo profile, response text and scenario definitions                                                        |
| `src/services/webRTCDiagnostics.ts`              | Real WebRTC diagnostics reader, available for future integration                                            |
| `src/types/session.ts`                           | User, match, message, connection and session contracts                                                      |
| `src/styles/cosmic.css`                          | Responsive visual system, animation and reduced-motion support                                              |
| `src/services/*.test.ts`, `tests/peerly.spec.ts` | State-machine, diagnostics and browser tests                                                                |

The original empty JavaScript scaffolding remains available for future features. Existing `global.css`, `variables.css`, project documents, and network experiments were preserved. Component CSS extends the existing theme tokens. Lightweight CSS/SVG animations and Lucide icons avoid adding a component framework or animation runtime solely for decoration.

## Spring Boot and WebRTC integration still required

- Implement an authenticated signaling adapter against the actual Spring Boot WebSocket contract: matchmaking, cancellation, match IDs, acceptance/rejection, expiration, SDP offer/answer and ICE candidate exchange. No endpoint contract is assumed here.
- Replace the `DemoSession` provider with a real session implementation using the contracts in `src/types/session.ts`; separate demo-only scenario/profile controls from real account behavior.
- Create and own the `RTCPeerConnection` and `RTCDataChannel` in the service layer. Wait for confirmed remote acceptance and the channel's `open` event before entering chat. Handle ICE buffering, peer departure, reconnection and stale session events.
- Obtain STUN/TURN configuration and short-lived TURN credentials from the backend. Test across separate devices and networks, including a forced TURN relay.
- Wire real messages to DataChannel send/message events with payload validation, limits, backpressure and delivery semantics. Never interpret user text as HTML.
- Poll `readWebRTCDiagnostics(peer, channel)` for real state and statistics. It uses the transport's selected candidate pair, inspects both candidates for `relay`, and reports **Unknown** when the path is unavailable. An open DataChannel alone does not establish a direct path. Unavailable measurements stay unavailable.
- Close channels and peer connections, unsubscribe signaling listeners, and cancel timers on rejection, end, navigation teardown and provider disposal.
- Verify authentication, matching concurrency, real peer acceptance, signaling failures, ICE/TURN behavior and reconnect policy with the real backend before presenting the application as live.

## Validation and limits

Automated checks cover cancellation and stale callbacks, acceptance gating, timeout/rejection/failure, UTF-8 byte counting in mock diagnostics, send limits, cleanup, and selected ICE-pair classification. Browser tests exercise all three screens at 375, 768, 1024 and 1440 pixels, keyboard composition, safe text rendering, dialogs, draft preservation, long messages, scenario recovery and reduced motion.

The mobile layout uses dynamic viewport height, safe-area padding, and `interactive-widget=resizes-content`. A reduced-height browser viewport verifies composer placement; physical iOS/Android keyboard behavior and real network connections still require device testing. No backend or network experiment files were changed.
