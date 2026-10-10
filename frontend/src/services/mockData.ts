import type { Scenario, User } from "../types/session";
export const localUser: User = {
  id: "you",
  name: "Alex",
  bio: "A little curious about everything.",
  interests: ["Technology", "Music"],
  avatar: "self",
};
export const nova: User = {
  id: "demo-nova",
  name: "Nova",
  bio: "Exploring new ideas and meeting interesting people.",
  interests: ["Gaming", "Technology", "Music"],
  avatar: "nova",
};
export const scenarios: { value: Scenario; label: string }[] = [
  { value: "success", label: "Successful connection" },
  { value: "relay", label: "Successful TURN relay" },
  { value: "rejected", label: "Peer declines the match" },
  { value: "timeout", label: "Peer does not respond" },
  { value: "connection-failed", label: "Connection fails" },
  { value: "search-error", label: "Discovery error" },
];
export const demoReplies = [
  "Hey! Nice to meet you 👋 What have you been into lately?",
  "Gaming and technology are my thing. I’ve been exploring indie games lately!",
  "That sounds interesting! What got you into it?",
  "I love finding a new perspective. That’s the best part of meeting someone new ✨",
];
