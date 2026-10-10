export const interests = [
  "Technology",
  "Gaming",
  "Music",
  "Anime",
  "Movies",
  "Books",
  "Sports",
  "Art",
] as const;
export type Interest = (typeof interests)[number];
export interface User {
  id: string;
  name: string;
  bio: string;
  interests: Interest[];
  avatar: "self" | "nova";
}
export type MatchState =
  | "idle"
  | "searching"
  | "found"
  | "waiting-local"
  | "waiting-remote"
  | "connecting"
  | "ready"
  | "cancelled"
  | "rejected"
  | "timed-out"
  | "connection-failed"
  | "error";
export type ConnectionState =
  | "connecting"
  | "direct"
  | "relay"
  | "reconnecting"
  | "disconnected"
  | "failed";
export type Scenario =
  | "success"
  | "relay"
  | "rejected"
  | "timeout"
  | "connection-failed"
  | "search-error";
export interface Message {
  id: string;
  sender: "self" | "peer";
  text: string;
  timestamp: number;
  simulated: boolean;
}
export interface Match {
  id: string;
  peer: User;
  expiresAt: number;
}
export interface Diagnostics {
  simulated: boolean;
  peerState: string;
  iceState: string;
  channelState: string;
  path: "Direct" | "TURN Relay" | "Unknown";
  roundTripMs?: number;
  bytesSent?: number;
  bytesReceived?: number;
}
export interface SessionState {
  state: MatchState;
  connection: ConnectionState;
  match: Match | null;
  messages: Message[];
  selectedInterests: Interest[];
  mode: "random" | "interests";
  scenario: Scenario;
  user: User;
  typing: boolean;
  notice: string | null;
}
/** Backend integration boundary. UI never owns signaling or peer connections. */
export interface PeerlySession {
  getSnapshot: () => SessionState;
  subscribe: (listener: () => void) => () => void;
  find: () => void;
  cancel: () => void;
  accept: () => void;
  skip: () => void;
  end: () => void;
  send: (text: string) => boolean;
  dispose: () => void;
}
