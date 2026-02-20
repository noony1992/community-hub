import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface VoiceParticipant {
  userId: string;
  displayName: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  self: boolean;
}

interface VoiceState {
  activeVoiceChannelId: string | null;
  participants: VoiceParticipant[];
  isConnected: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  voiceLatencyMs: number | null;
  joinVoiceChannel: (channelId: string) => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
}

const VoiceContext = createContext<VoiceState | null>(null);

export const useVoiceContext = () => {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoiceContext must be used within VoiceProvider");
  return ctx;
};

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type SignalPayload = {
  type: "offer" | "answer" | "ice";
  from: string;
  to: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [voiceLatencyMs, setVoiceLatencyMs] = useState<number | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const signalChannelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakingStateRef = useRef<Record<string, boolean>>({});
  const speakingLoopRef = useRef<Map<string, number>>(new Map());
  const speakingCleanupRef = useRef<Map<string, () => void>>(new Map());
  const isMutedRef = useRef(false);
  const isDeafenedRef = useRef(false);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isDeafenedRef.current = isDeafened;
    audioElementsRef.current.forEach((audio) => {
      audio.muted = isDeafened;
    });
  }, [isDeafened]);

  const getDisplayName = useCallback(() => {
    if (!user) return "Unknown";
    return (
      user.user_metadata?.display_name ||
      user.user_metadata?.username ||
      user.email?.split("@")[0] ||
      "Unknown"
    );
  }, [user]);

  const updateLocalAudioTrack = useCallback((muted: boolean, deafened: boolean) => {
    const enabled = !(muted || deafened);
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, []);

  const updatePresence = useCallback(() => {
    const channel = signalChannelRef.current;
    if (!channel || !user) return;
    channel.track({
      display_name: getDisplayName(),
      muted: isMutedRef.current,
      deafened: isDeafenedRef.current,
    });
  }, [getDisplayName, user]);

  const removePeer = useCallback((userId: string) => {
    const peer = peersRef.current.get(userId);
    if (peer) {
      peer.close();
      peersRef.current.delete(userId);
    }

    const stream = remoteStreamsRef.current.get(userId);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      remoteStreamsRef.current.delete(userId);
    }

    const audio = audioElementsRef.current.get(userId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      audioElementsRef.current.delete(userId);
    }

    const speakingCleanup = speakingCleanupRef.current.get(userId);
    if (speakingCleanup) {
      speakingCleanup();
      speakingCleanupRef.current.delete(userId);
    }

    const speakingRaf = speakingLoopRef.current.get(userId);
    if (speakingRaf) {
      cancelAnimationFrame(speakingRaf);
      speakingLoopRef.current.delete(userId);
    }

    if (speakingStateRef.current[userId]) {
      speakingStateRef.current = { ...speakingStateRef.current, [userId]: false };
      setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, speaking: false } : p)));
    }
  }, []);

  const startSpeakingDetection = useCallback((userId: string, stream: MediaStream) => {
    if (speakingCleanupRef.current.has(userId)) return;

    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audioContextRef.current = new Ctx();
    }

    const audioContext = audioContextRef.current;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    const threshold = 0.028;
    let smooth = 0;

    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i += 1) {
        const centered = (data[i] - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      smooth = smooth * 0.75 + rms * 0.25;
      const speakingNow = smooth > threshold;

      if (speakingStateRef.current[userId] !== speakingNow) {
        speakingStateRef.current = { ...speakingStateRef.current, [userId]: speakingNow };
        setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, speaking: speakingNow } : p)));
      }

      const raf = requestAnimationFrame(loop);
      speakingLoopRef.current.set(userId, raf);
    };

    const raf = requestAnimationFrame(loop);
    speakingLoopRef.current.set(userId, raf);
    speakingCleanupRef.current.set(userId, () => {
      source.disconnect();
      analyser.disconnect();
    });
  }, []);

  const leaveVoiceChannel = useCallback(async () => {
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();

    remoteStreamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    remoteStreamsRef.current.clear();

    audioElementsRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();

    speakingLoopRef.current.forEach((id) => cancelAnimationFrame(id));
    speakingLoopRef.current.clear();
    speakingCleanupRef.current.forEach((cleanup) => cleanup());
    speakingCleanupRef.current.clear();
    speakingStateRef.current = {};

    if (signalChannelRef.current) {
      signalChannelRef.current.untrack();
      supabase.removeChannel(signalChannelRef.current);
      signalChannelRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    setParticipants([]);
    setIsConnected(false);
    setActiveVoiceChannelId(null);
    setVoiceLatencyMs(null);
  }, []);

  const sampleVoiceLatency = useCallback(async () => {
    if (peersRef.current.size === 0) {
      setVoiceLatencyMs(null);
      return;
    }

    const samples: number[] = [];
    for (const pc of peersRef.current.values()) {
      try {
        const stats = await pc.getStats();
        stats.forEach((report) => {
          if (report.type !== "candidate-pair") return;
          const pair = report as RTCIceCandidatePairStats;
          if (pair.state !== "succeeded" || !pair.nominated) return;
          if (typeof pair.currentRoundTripTime === "number") {
            samples.push(pair.currentRoundTripTime * 1000);
          }
        });
      } catch {
        // Ignore per-peer stats failures and use remaining peers.
      }
    }

    if (samples.length === 0) {
      setVoiceLatencyMs(null);
      return;
    }
    const avg = samples.reduce((sum, n) => sum + n, 0) / samples.length;
    setVoiceLatencyMs(Math.max(1, Math.round(avg)));
  }, []);

  const sendSignal = useCallback((payload: SignalPayload) => {
    signalChannelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload,
    });
  }, []);

  const ensureAudioElement = useCallback((userId: string, stream: MediaStream) => {
    let audio = audioElementsRef.current.get(userId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      audioElementsRef.current.set(userId, audio);
    }
    audio.srcObject = stream;
    audio.muted = isDeafenedRef.current;
    void audio.play().catch(() => undefined);
  }, []);

  const createPeer = useCallback(
    async (targetUserId: string, initiator: boolean) => {
      if (!user || peersRef.current.has(targetUserId)) return peersRef.current.get(targetUserId)!;
      const pc = new RTCPeerConnection(rtcConfig);
      peersRef.current.set(targetUserId, pc);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current as MediaStream);
        });
      }

      pc.onicecandidate = (event) => {
        if (!event.candidate || !user) return;
        sendSignal({
          type: "ice",
          from: user.id,
          to: targetUserId,
          data: event.candidate.toJSON(),
        });
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        remoteStreamsRef.current.set(targetUserId, stream);
        ensureAudioElement(targetUserId, stream);
        startSpeakingDetection(targetUserId, stream);
      };

      pc.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
          removePeer(targetUserId);
        }
      };

      if (initiator && user) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({
          type: "offer",
          from: user.id,
          to: targetUserId,
          data: offer,
        });
      }

      return pc;
    },
    [ensureAudioElement, removePeer, sendSignal, startSpeakingDetection, user],
  );

  const syncParticipantsFromPresence = useCallback(() => {
    const channel = signalChannelRef.current;
    if (!channel || !user) return;

    const state = channel.presenceState();
    const all = Object.entries(state).map(([uid, presences]) => {
      const meta = (presences[0] || {}) as { display_name?: string; muted?: boolean; deafened?: boolean };
      return {
        userId: uid,
        displayName: meta.display_name || "Unknown",
        muted: !!meta.muted,
        deafened: !!meta.deafened,
        speaking: !!speakingStateRef.current[uid],
        self: uid === user.id,
      } satisfies VoiceParticipant;
    });

    setParticipants(all);

    const remoteIds = all.filter((p) => !p.self).map((p) => p.userId);

    remoteIds.forEach((remoteId) => {
      if (!peersRef.current.has(remoteId)) {
        const shouldInitiate = user.id > remoteId;
        void createPeer(remoteId, shouldInitiate);
      }
    });

    Array.from(peersRef.current.keys()).forEach((peerId) => {
      if (!remoteIds.includes(peerId)) removePeer(peerId);
    });
  }, [createPeer, removePeer, user]);

  const joinVoiceChannel = useCallback(
    async (channelId: string) => {
      if (!user) return;
      if (activeVoiceChannelId === channelId && isConnected) return;

      await leaveVoiceChannel();

      let localStream: MediaStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        alert("Microphone access is required for voice channels.");
        return;
      }

      localStreamRef.current = localStream;
      startSpeakingDetection(user.id, localStream);
      updateLocalAudioTrack(isMutedRef.current, isDeafenedRef.current);

      const voiceChannel = supabase.channel(`voice:${channelId}`, {
        config: { presence: { key: user.id } },
      });

      voiceChannel
        .on("broadcast", { event: "signal" }, async ({ payload }: { payload: SignalPayload }) => {
          if (!user || payload.to !== user.id) return;
          const fromUserId = payload.from;

          if (payload.type === "offer") {
            const pc = await createPeer(fromUserId, false);
            await pc.setRemoteDescription(new RTCSessionDescription(payload.data as RTCSessionDescriptionInit));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal({
              type: "answer",
              from: user.id,
              to: fromUserId,
              data: answer,
            });
            return;
          }

          if (payload.type === "answer") {
            const pc = peersRef.current.get(fromUserId);
            if (!pc) return;
            await pc.setRemoteDescription(new RTCSessionDescription(payload.data as RTCSessionDescriptionInit));
            return;
          }

          if (payload.type === "ice") {
            const pc = peersRef.current.get(fromUserId);
            if (!pc) return;
            await pc.addIceCandidate(new RTCIceCandidate(payload.data as RTCIceCandidateInit));
          }
        })
        .on("presence", { event: "sync" }, syncParticipantsFromPresence);

      voiceChannel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          signalChannelRef.current = voiceChannel;
          setIsConnected(true);
          setActiveVoiceChannelId(channelId);
          updatePresence();
        }
      });
    },
    [activeVoiceChannelId, createPeer, isConnected, leaveVoiceChannel, sendSignal, startSpeakingDetection, syncParticipantsFromPresence, updateLocalAudioTrack, updatePresence, user],
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      updateLocalAudioTrack(next, isDeafenedRef.current);
      requestAnimationFrame(updatePresence);
      return next;
    });
  }, [updateLocalAudioTrack, updatePresence]);

  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => {
      const next = !prev;
      updateLocalAudioTrack(isMutedRef.current, next);
      requestAnimationFrame(updatePresence);
      return next;
    });
  }, [updateLocalAudioTrack, updatePresence]);

  useEffect(() => {
    return () => {
      void leaveVoiceChannel();
    };
  }, [leaveVoiceChannel]);

  useEffect(() => {
    if (!isConnected) {
      setVoiceLatencyMs(null);
      return;
    }

    void sampleVoiceLatency();
    const intervalId = window.setInterval(() => {
      void sampleVoiceLatency();
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isConnected, sampleVoiceLatency, participants.length]);

  const value = useMemo(
    () => ({
      activeVoiceChannelId,
      participants,
      isConnected,
      isMuted,
      isDeafened,
      voiceLatencyMs,
      joinVoiceChannel,
      leaveVoiceChannel,
      toggleMute,
      toggleDeafen,
    }),
    [activeVoiceChannelId, isConnected, isDeafened, isMuted, joinVoiceChannel, leaveVoiceChannel, participants, toggleDeafen, toggleMute, voiceLatencyMs],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
};
