import { Server, Channel, Message, User } from "./types";

export const currentUser: User = {
  id: "u1",
  username: "you",
  displayName: "Alex Chen",
  avatar: "AC",
  status: "online",
};

export const mockUsers: User[] = [
  currentUser,
  { id: "u2", username: "jamie", displayName: "Jamie Rivera", avatar: "JR", status: "online" },
  { id: "u3", username: "sam", displayName: "Sam Patel", avatar: "SP", status: "idle" },
  { id: "u4", username: "morgan", displayName: "Morgan Lee", avatar: "ML", status: "dnd" },
  { id: "u5", username: "taylor", displayName: "Taylor Kim", avatar: "TK", status: "offline" },
  { id: "u6", username: "jordan", displayName: "Jordan Wu", avatar: "JW", status: "online" },
  { id: "u7", username: "casey", displayName: "Casey Nguyen", avatar: "CN", status: "online" },
  { id: "u8", username: "riley", displayName: "Riley Adams", avatar: "RA", status: "offline" },
];

export const mockServers: Server[] = [
  { id: "s1", name: "Devs Hub", icon: "DH", color: "hsl(174, 60%, 45%)" },
  { id: "s2", name: "Gaming Lounge", icon: "GL", color: "hsl(262, 60%, 55%)" },
  { id: "s3", name: "Music Room", icon: "MR", color: "hsl(340, 65%, 50%)" },
  { id: "s4", name: "Art & Design", icon: "AD", color: "hsl(38, 80%, 50%)" },
  { id: "s5", name: "Study Group", icon: "SG", color: "hsl(200, 70%, 50%)" },
];

export const mockChannels: Record<string, Channel[]> = {
  s1: [
    { id: "c1", name: "general", type: "text", serverId: "s1" },
    { id: "c2", name: "introductions", type: "text", serverId: "s1" },
    { id: "c3", name: "help", type: "text", serverId: "s1" },
    { id: "c4", name: "show-and-tell", type: "text", serverId: "s1" },
    { id: "c5", name: "General", type: "voice", serverId: "s1" },
    { id: "c6", name: "Pair Programming", type: "voice", serverId: "s1" },
  ],
  s2: [
    { id: "c7", name: "general", type: "text", serverId: "s2" },
    { id: "c8", name: "lfg", type: "text", serverId: "s2" },
    { id: "c9", name: "clips", type: "text", serverId: "s2" },
    { id: "c10", name: "Game Night", type: "voice", serverId: "s2" },
  ],
  s3: [
    { id: "c11", name: "general", type: "text", serverId: "s3" },
    { id: "c12", name: "recommendations", type: "text", serverId: "s3" },
    { id: "c13", name: "Listening Party", type: "voice", serverId: "s3" },
  ],
  s4: [
    { id: "c14", name: "general", type: "text", serverId: "s4" },
    { id: "c15", name: "feedback", type: "text", serverId: "s4" },
    { id: "c16", name: "Studio", type: "voice", serverId: "s4" },
  ],
  s5: [
    { id: "c17", name: "general", type: "text", serverId: "s5" },
    { id: "c18", name: "resources", type: "text", serverId: "s5" },
    { id: "c19", name: "Study Room", type: "voice", serverId: "s5" },
  ],
};

const now = Date.now();
const min = 60000;

export const mockMessages: Record<string, Message[]> = {
  c1: [
    { id: "m1", content: "Hey everyone! Welcome to Devs Hub 🎉", userId: "u2", channelId: "c1", timestamp: now - 120 * min },
    { id: "m2", content: "Thanks for the invite! Excited to be here.", userId: "u3", channelId: "c1", timestamp: now - 115 * min },
    { id: "m3", content: "Anyone working on anything cool this week?", userId: "u6", channelId: "c1", timestamp: now - 60 * min },
    { id: "m4", content: "Building a chat app actually 😄", userId: "u1", channelId: "c1", timestamp: now - 55 * min },
    { id: "m5", content: "That's awesome! What stack are you using?", userId: "u2", channelId: "c1", timestamp: now - 50 * min },
    { id: "m6", content: "React + TypeScript + Tailwind. It's coming together nicely!", userId: "u1", channelId: "c1", timestamp: now - 45 * min },
    { id: "m7", content: "Nice stack choice. Let me know if you need help with the WebSocket layer.", userId: "u7", channelId: "c1", timestamp: now - 30 * min },
    { id: "m8", content: "Will do! Thanks Casey 🙏", userId: "u1", channelId: "c1", timestamp: now - 25 * min },
    { id: "m9", content: "Just pushed a new open source project. Check out the show-and-tell channel!", userId: "u4", channelId: "c1", timestamp: now - 10 * min },
    { id: "m10", content: "Oh nice, heading there now!", userId: "u3", channelId: "c1", timestamp: now - 5 * min },
  ],
  c2: [
    { id: "m11", content: "Hi! I'm Jamie, full-stack dev from Portland 👋", userId: "u2", channelId: "c2", timestamp: now - 200 * min },
    { id: "m12", content: "Welcome Jamie! I'm Sam, mostly into backend stuff.", userId: "u3", channelId: "c2", timestamp: now - 195 * min },
  ],
};
