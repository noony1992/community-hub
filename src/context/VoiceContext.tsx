import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";

interface VoiceParticipant {
  userId: string;
  displayName: string;
  muted: boolean;
  deafened: boolean;
  forcedMuted: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  speaking: boolean;
  self: boolean;
}

type VoiceModerationAction = "kick" | "force_mute" | "force_unmute" | "move";

interface VoiceState {
  activeVoiceChannelId: string | null;
  participants: VoiceParticipant[];
  videoStreamsByUser: Record<string, MediaStream>;
  isConnected: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  voiceLatencyMs: number | null;
  moderateVoiceParticipant: (targetUserId: string, action: VoiceModerationAction, targetChannelId?: string) => Promise<void>;
  joinVoiceChannel: (channelId: string) => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
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

type VoiceModPayload = {
  action: VoiceModerationAction;
  to: string;
  target_channel_id?: string;
};

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [videoStreamsByUser, setVideoStreamsByUser] = useState<Record<string, MediaStream>>({});
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [voiceLatencyMs, setVoiceLatencyMs] = useState<number | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const localCameraStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const activeVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const activeVideoSourceRef = useRef<"camera" | "screen" | null>(null);
  const signalChannelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const videoSenderByPeerRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakingStateRef = useRef<Record<string, boolean>>({});
  const speakingLoopRef = useRef<Map<string, number>>(new Map());
  const speakingCleanupRef = useRef<Map<string, () => void>>(new Map());
  const videoRecoveryRequestAtRef = useRef<Record<string, number>>({});
  const isMutedRef = useRef(false);
  const isDeafenedRef = useRef(false);
  const isForcedMutedRef = useRef(false);
  const isCameraOnRef = useRef(false);
  const isScreenSharingRef = useRef(false);
  const joinVoiceChannelRef = useRef<(channelId: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isDeafenedRef.current = isDeafened;
    audioElementsRef.current.forEach((audio) => {
      audio.muted = isDeafened;
    });
  }, [isDeafened]);

  useEffect(() => {
    isCameraOnRef.current = isCameraOn;
  }, [isCameraOn]);

  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

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
      forced_muted: isForcedMutedRef.current,
      camera_on: isCameraOnRef.current,
      screen_on: isScreenSharingRef.current,
    });
  }, [getDisplayName, user]);

  const removePeer = useCallback((userId: string) => {
    const peer = peersRef.current.get(userId);
    if (peer) {
      peer.close();
      peersRef.current.delete(userId);
    }

    videoSenderByPeerRef.current.delete(userId);

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

    setVideoStreamsByUser((prev) => {
      if (!prev[userId]) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    delete videoRecoveryRequestAtRef.current[userId];
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

  const stopMediaStream = useCallback((stream: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
  }, []);

  const leaveVoiceChannel = useCallback(async () => {
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    videoSenderByPeerRef.current.clear();

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
    videoRecoveryRequestAtRef.current = {};

    if (signalChannelRef.current) {
      signalChannelRef.current.untrack();
      supabase.removeChannel(signalChannelRef.current);
      signalChannelRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    stopMediaStream(localCameraStreamRef.current);
    stopMediaStream(localScreenStreamRef.current);
    localCameraStreamRef.current = null;
    localScreenStreamRef.current = null;
    activeVideoTrackRef.current = null;
    activeVideoSourceRef.current = null;

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    setParticipants([]);
    setVideoStreamsByUser({});
    setIsConnected(false);
    setActiveVoiceChannelId(null);
    setIsCameraOn(false);
    setIsScreenSharing(false);
    isCameraOnRef.current = false;
    isScreenSharingRef.current = false;
    setVoiceLatencyMs(null);
    isForcedMutedRef.current = false;
  }, [stopMediaStream]);

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

  const setSelfVideoPreview = useCallback(
    (track: MediaStreamTrack | null) => {
      if (!user) return;
      setVideoStreamsByUser((prev) => {
        const hasCurrent = !!prev[user.id];
        if (!track) {
          if (!hasCurrent) return prev;
          const next = { ...prev };
          delete next[user.id];
          return next;
        }
        const stream = new MediaStream([track]);
        return { ...prev, [user.id]: stream };
      });
    },
    [user],
  );

  const renegotiatePeer = useCallback(
    (peerId: string, pc: RTCPeerConnection, attempt = 0) => {
      if (!user) return;
      if (pc.signalingState !== "stable") {
        if (attempt < 6) {
          window.setTimeout(() => renegotiatePeer(peerId, pc, attempt + 1), 120);
        }
        return;
      }

      void (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal({
            type: "offer",
            from: user.id,
            to: peerId,
            data: offer,
          });
        } catch {
          // Ignore transient renegotiation failures; future signaling will recover.
        }
      })();
    },
    [sendSignal, user],
  );

  const attachVideoTrackToPeer = useCallback(
    async (peerId: string, pc: RTCPeerConnection, track: MediaStreamTrack, sourceStream: MediaStream) => {
      const existingSender = videoSenderByPeerRef.current.get(peerId);
      if (existingSender) {
        await existingSender.replaceTrack(track);
        return;
      }
      const sender = pc.addTrack(track, sourceStream);
      videoSenderByPeerRef.current.set(peerId, sender);
      renegotiatePeer(peerId, pc);
    },
    [renegotiatePeer],
  );

  const detachVideoTrackFromPeer = useCallback(
    async (peerId: string, pc: RTCPeerConnection) => {
      const sender = videoSenderByPeerRef.current.get(peerId);
      if (!sender) return;
      try {
        await sender.replaceTrack(null);
      } catch {
        // Ignore and attempt removeTrack below.
      }
      try {
        pc.removeTrack(sender);
      } catch {
        // removeTrack can fail if connection is already closing.
      }
      videoSenderByPeerRef.current.delete(peerId);
      renegotiatePeer(peerId, pc);
    },
    [renegotiatePeer],
  );

  const clearActiveVideoSource = useCallback(async () => {
    const localTrack = activeVideoTrackRef.current;
    activeVideoTrackRef.current = null;
    activeVideoSourceRef.current = null;

    const detachTasks = Array.from(peersRef.current.entries()).map(([peerId, pc]) => detachVideoTrackFromPeer(peerId, pc));
    await Promise.allSettled(detachTasks);

    if (localTrack) {
      localTrack.stop();
    }

    setSelfVideoPreview(null);
  }, [detachVideoTrackFromPeer, setSelfVideoPreview]);

  const activateVideoSource = useCallback(
    async (source: "camera" | "screen", stream: MediaStream) => {
      const [videoTrack] = stream.getVideoTracks();
      if (!videoTrack) throw new Error("No video track available.");

      activeVideoTrackRef.current = videoTrack;
      activeVideoSourceRef.current = source;
      setSelfVideoPreview(videoTrack);

      const attachTasks = Array.from(peersRef.current.entries()).map(([peerId, pc]) =>
        attachVideoTrackToPeer(peerId, pc, videoTrack, stream),
      );
      await Promise.allSettled(attachTasks);
    },
    [attachVideoTrackToPeer, setSelfVideoPreview],
  );

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
      if (activeVideoTrackRef.current) {
        const sourceStream = activeVideoSourceRef.current === "screen" ? localScreenStreamRef.current : localCameraStreamRef.current;
        if (sourceStream) {
          const sender = pc.addTrack(activeVideoTrackRef.current, sourceStream);
          videoSenderByPeerRef.current.set(targetUserId, sender);
        }
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
        if (event.track.kind === "audio" || stream.getAudioTracks().length > 0) {
          ensureAudioElement(targetUserId, stream);
          startSpeakingDetection(targetUserId, stream);
        }

        const syncVideoState = () => {
          const hasLiveVideo = stream.getVideoTracks().some(
            (track) => track.readyState === "live" && !track.muted && track.enabled,
          );
          setVideoStreamsByUser((prev) => {
            if (hasLiveVideo) {
              if (prev[targetUserId] === stream) return prev;
              return { ...prev, [targetUserId]: stream };
            }
            if (!prev[targetUserId]) return prev;
            const next = { ...prev };
            delete next[targetUserId];
            return next;
          });
        };

        syncVideoState();
        stream.onaddtrack = syncVideoState;
        stream.onremovetrack = syncVideoState;
        stream.getVideoTracks().forEach((track) => {
          track.onended = syncVideoState;
          track.onmute = syncVideoState;
          track.onunmute = syncVideoState;
        });
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
      const meta = (presences[0] || {}) as {
        display_name?: string;
        muted?: boolean;
        deafened?: boolean;
        forced_muted?: boolean;
        camera_on?: boolean;
        screen_on?: boolean;
      };
      return {
        userId: uid,
        displayName: meta.display_name || "Unknown",
        muted: !!meta.muted,
        deafened: !!meta.deafened,
        forcedMuted: !!meta.forced_muted,
        cameraOn: !!meta.camera_on,
        screenSharing: !!meta.screen_on,
        speaking: !!speakingStateRef.current[uid],
        self: uid === user.id,
      } satisfies VoiceParticipant;
    });

    setParticipants(all);

    const remoteParticipants = all.filter((p) => !p.self);
    const remoteIds = remoteParticipants.map((p) => p.userId);
    const remoteUsersPublishingVideo = new Set(
      remoteParticipants
        .filter((p) => p.cameraOn || p.screenSharing)
        .map((p) => p.userId),
    );

    setVideoStreamsByUser((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach((uid) => {
        if (uid === user.id) return;
        if (!remoteUsersPublishingVideo.has(uid)) {
          delete next[uid];
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    remoteIds.forEach((remoteId) => {
      if (!peersRef.current.has(remoteId)) {
        const shouldInitiate = user.id > remoteId;
        void createPeer(remoteId, shouldInitiate);
      }
    });

    Array.from(peersRef.current.keys()).forEach((peerId) => {
      if (!remoteIds.includes(peerId)) {
        removePeer(peerId);
        delete videoRecoveryRequestAtRef.current[peerId];
      }
    });

    remoteParticipants.forEach((participant) => {
      if (!(participant.cameraOn || participant.screenSharing)) return;
      const pc = peersRef.current.get(participant.userId);
      if (!pc || ["closed", "failed"].includes(pc.connectionState)) return;

      const remoteStream = remoteStreamsRef.current.get(participant.userId);
      const hasLiveVideo = !!remoteStream?.getVideoTracks().some(
        (track) => track.readyState === "live" && !track.muted && track.enabled,
      );
      if (hasLiveVideo) return;

      const now = Date.now();
      const lastRequestAt = videoRecoveryRequestAtRef.current[participant.userId] || 0;
      if (now - lastRequestAt < 1800) return;
      videoRecoveryRequestAtRef.current[participant.userId] = now;
      renegotiatePeer(participant.userId, pc);
    });
  }, [createPeer, removePeer, renegotiatePeer, user]);

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
        .on("broadcast", { event: "mod_action" }, async ({ payload }: { payload: VoiceModPayload }) => {
          if (!user || payload.to !== user.id) return;

          if (payload.action === "kick") {
            await leaveVoiceChannel();
            return;
          }

          if (payload.action === "force_mute") {
            isForcedMutedRef.current = true;
            setIsMuted(true);
            updateLocalAudioTrack(true, isDeafenedRef.current);
            requestAnimationFrame(updatePresence);
            return;
          }

          if (payload.action === "force_unmute") {
            isForcedMutedRef.current = false;
            setIsMuted(false);
            updateLocalAudioTrack(false, isDeafenedRef.current);
            requestAnimationFrame(updatePresence);
            return;
          }

          if (payload.action === "move" && payload.target_channel_id) {
            const targetChannelId = payload.target_channel_id;
            await leaveVoiceChannel();
            window.setTimeout(() => {
              void joinVoiceChannelRef.current(targetChannelId);
            }, 20);
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

  useEffect(() => {
    joinVoiceChannelRef.current = joinVoiceChannel;
  }, [joinVoiceChannel]);

  const moderateVoiceParticipant = useCallback(async (targetUserId: string, action: VoiceModerationAction, targetChannelId?: string) => {
    const channel = signalChannelRef.current;
    if (!channel || !user || !isConnected) {
      throw new Error("Not connected to voice.");
    }
    if (action === "move" && !targetChannelId) {
      throw new Error("Target voice channel is required.");
    }

    const payload: VoiceModPayload = {
      action,
      to: targetUserId,
      ...(targetChannelId ? { target_channel_id: targetChannelId } : {}),
    };

    await channel.send({
      type: "broadcast",
      event: "mod_action",
      payload,
    });
  }, [isConnected, user]);

  const toggleMute = useCallback(() => {
    if (isForcedMutedRef.current) return;
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

  const toggleCamera = useCallback(async () => {
    if (!isConnected) {
      toast.error("Join a voice channel to use your camera.");
      return;
    }

    if (activeVideoSourceRef.current === "camera") {
      await clearActiveVideoSource();
      stopMediaStream(localCameraStreamRef.current);
      localCameraStreamRef.current = null;
      setIsCameraOn(false);
      setIsScreenSharing(false);
      isCameraOnRef.current = false;
      isScreenSharingRef.current = false;
      requestAnimationFrame(updatePresence);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch {
      toast.error("Camera access was denied.");
      return;
    }

    await clearActiveVideoSource();
    stopMediaStream(localScreenStreamRef.current);
    localScreenStreamRef.current = null;
    stopMediaStream(localCameraStreamRef.current);
    localCameraStreamRef.current = stream;

    await activateVideoSource("camera", stream);
    setIsCameraOn(true);
    setIsScreenSharing(false);
    isCameraOnRef.current = true;
    isScreenSharingRef.current = false;
    requestAnimationFrame(updatePresence);
  }, [activateVideoSource, clearActiveVideoSource, isConnected, stopMediaStream, updatePresence]);

  const toggleScreenShare = useCallback(async () => {
    if (!isConnected) {
      toast.error("Join a voice channel to share your screen.");
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screen sharing is not supported in this browser.");
      return;
    }

    if (activeVideoSourceRef.current === "screen") {
      await clearActiveVideoSource();
      stopMediaStream(localScreenStreamRef.current);
      localScreenStreamRef.current = null;
      setIsScreenSharing(false);
      setIsCameraOn(false);
      isScreenSharingRef.current = false;
      isCameraOnRef.current = false;
      requestAnimationFrame(updatePresence);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch {
      toast.error("Screen share permission was denied.");
      return;
    }

    await clearActiveVideoSource();
    stopMediaStream(localCameraStreamRef.current);
    localCameraStreamRef.current = null;
    stopMediaStream(localScreenStreamRef.current);
    localScreenStreamRef.current = stream;

    const [track] = stream.getVideoTracks();
    if (track) {
      track.onended = () => {
        if (activeVideoSourceRef.current !== "screen") return;
        void (async () => {
          await clearActiveVideoSource();
          stopMediaStream(localScreenStreamRef.current);
          localScreenStreamRef.current = null;
          setIsScreenSharing(false);
          setIsCameraOn(false);
          isScreenSharingRef.current = false;
          isCameraOnRef.current = false;
          requestAnimationFrame(updatePresence);
        })();
      };
    }

    await activateVideoSource("screen", stream);
    setIsScreenSharing(true);
    setIsCameraOn(false);
    isScreenSharingRef.current = true;
    isCameraOnRef.current = false;
    requestAnimationFrame(updatePresence);
  }, [activateVideoSource, clearActiveVideoSource, isConnected, stopMediaStream, updatePresence]);

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
      videoStreamsByUser,
      isConnected,
      isMuted,
      isDeafened,
      isCameraOn,
      isScreenSharing,
      voiceLatencyMs,
      moderateVoiceParticipant,
      joinVoiceChannel,
      leaveVoiceChannel,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      toggleScreenShare,
    }),
    [
      activeVoiceChannelId,
      isCameraOn,
      isConnected,
      isDeafened,
      isMuted,
      isScreenSharing,
      joinVoiceChannel,
      leaveVoiceChannel,
      moderateVoiceParticipant,
      participants,
      toggleDeafen,
      toggleCamera,
      toggleMute,
      toggleScreenShare,
      videoStreamsByUser,
      voiceLatencyMs,
    ],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
};
