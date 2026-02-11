export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  status: "online" | "idle" | "dnd" | "offline";
}

export interface Server {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
  serverId: string;
}

export interface Message {
  id: string;
  content: string;
  userId: string;
  channelId: string;
  timestamp: number;
}
