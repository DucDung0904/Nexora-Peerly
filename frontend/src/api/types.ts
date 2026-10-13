export type Goal = "NEW_FRIENDS" | "TALK" | "GAMING";
export type Visibility = "HIDDEN" | "DISCOVERABLE";

export interface UserView {
  id: string;
  email: string;
  displayName: string;
  birthDate: string;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  displayName: string;
  birthDate: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  user: UserView;
}

export interface CatalogItem {
  code: string;
  label: string;
}

export interface GameCatalogItem extends CatalogItem {
  supportsCrossplay: boolean;
}

export interface Catalog {
  interests: CatalogItem[];
  socialGoals: CatalogItem[];
  games: GameCatalogItem[];
  platforms: CatalogItem[];
  datingIntents: CatalogItem[];
  datingValues: CatalogItem[];
}

export interface GameChoice {
  gameCode: string;
  platformCode: string;
  crossplayEnabled: boolean;
}

export interface SocialUpdate {
  bio: string;
  enabled: boolean;
  readyToConnect: boolean;
  goals: Goal[];
  interests: string[];
  games: GameChoice[];
}

export interface SocialProfile extends SocialUpdate {
  userId: string;
}

export interface DatingUpdate {
  bio: string;
  enabled: boolean;
  visibility: Visibility;
  intentCode: string;
  preferredMinAge: number;
  preferredMaxAge: number;
  interests: string[];
  values: string[];
  acceptedIntents: string[];
}

export interface DatingProfile extends DatingUpdate {
  userId: string;
}

export interface Candidate {
  id: string;
  displayName: string;
  age: number;
  bio: string;
  score: number;
  interests: string[];
  compatibleGames: string[];
  reasons: string[];
}

export interface MatchView {
  id: string;
  otherUserId: string;
  displayName: string;
  status: string;
  createdAt: string;
}

export interface LikeResult {
  liked: boolean;
  mutual: boolean;
  matchId: string | null;
}

export interface ConversationView {
  id: string;
  matchId: string | null;
  socialInviteId: string | null;
  otherUserId: string;
  displayName: string;
  createdAt: string;
}

export interface SocialInviteView {
  id: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  recipientName: string;
  goalCode: Goal;
  expiresAt: string;
}

export interface SocialInviteResult {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  conversationId: string | null;
}

export interface IceServerView {
  urls: string[];
  username: string | null;
  credential: string | null;
}
