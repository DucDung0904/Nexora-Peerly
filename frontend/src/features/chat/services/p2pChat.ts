import type { IceServerView } from "../../../api/types";

export type PeerConnectionState =
  "connecting" | "connected" | "direct" | "relay" | "disconnected" | "failed";

export interface PeerMessage {
  id: string;
  text: string;
  sentAt: string;
  own?: boolean;
}

export interface P2PChatConnection {
  send: (text: string) => boolean;
  close: () => void;
}

interface StartOptions {
  conversationId: string;
  userId: string;
  peerId: string;
  token: string;
  iceServers: IceServerView[];
  onState: (state: PeerConnectionState) => void;
  onMessage: (message: PeerMessage) => void;
}

function websocketUrl(conversationId: string) {
  const configuredApi = (
    (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env
      ?.VITE_API_BASE_URL || "/api"
  ).replace(/\/+$/, "");
  const url = new URL(configuredApi, window.location.href);
  url.pathname = `${url.pathname.replace(/\/api\/?$/, "")}/ws/signaling`;
  url.search = new URLSearchParams({ conversationId }).toString();
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

export function connectPeerChat(options: StartOptions): P2PChatConnection {
  const configuration: RTCConfiguration = {
    iceServers: options.iceServers.map(({ urls, username, credential }) => ({
      urls,
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    })),
  };
  let peer = new RTCPeerConnection(configuration);
  const signal = new WebSocket(websocketUrl(options.conversationId), [
    "nexory.v1",
    `bearer.${options.token}`,
  ]);
  const initiator = options.userId < options.peerId;
  let channel: RTCDataChannel | null = null;
  let isClosed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const pendingCandidates: RTCIceCandidateInit[] = [];

  const sendSignal = (type: string, data: unknown) => {
    if (signal.readyState === WebSocket.OPEN)
      signal.send(JSON.stringify({ type, data }));
  };
  const updateState = async () => {
    const current = peer;
    if (isClosed || peer.connectionState === "closed") return;
    if (peer.connectionState === "failed") return options.onState("failed");
    if (peer.connectionState === "disconnected")
      return options.onState("disconnected");
    if (peer.connectionState !== "connected" || channel?.readyState !== "open")
      return options.onState("connecting");
    try {
      const stats = await peer.getStats();
      let selectedPair: RTCStats | undefined;
      stats.forEach((report) => {
        if (report.type === "transport" && report.selectedCandidatePairId)
          selectedPair = stats.get(report.selectedCandidatePairId);
      });
      if (!selectedPair) {
        stats.forEach((report) => {
          if (
            report.type === "candidate-pair" &&
            report.state === "succeeded" &&
            report.nominated
          )
            selectedPair = report;
        });
      }
      const localId = (
        selectedPair as (RTCStats & { localCandidateId?: string }) | undefined
      )?.localCandidateId;
      const remoteId = (
        selectedPair as (RTCStats & { remoteCandidateId?: string }) | undefined
      )?.remoteCandidateId;
      const localType = localId ? stats.get(localId)?.candidateType : undefined;
      const remoteType = remoteId
        ? stats.get(remoteId)?.candidateType
        : undefined;
      if (!isClosed && current === peer && channel?.readyState === "open")
        options.onState(
          localType === "relay" || remoteType === "relay"
            ? "relay"
            : localType && remoteType
              ? "direct"
              : "connected",
        );
    } catch {
      if (!isClosed && current === peer) options.onState("connected");
    }
  };

  const attachChannel = (dataChannel: RTCDataChannel) => {
    const current = peer;
    if (dataChannel.label !== "peerly-chat") {
      dataChannel.close();
      return;
    }
    channel = dataChannel;
    channel.onopen = () => void updateState();
    channel.onclose = () => {
      if (!isClosed && current === peer) options.onState("disconnected");
    };
    channel.onmessage = (event) => {
      if (
        isClosed ||
        current !== peer ||
        typeof event.data !== "string" ||
        event.data.length > 65536
      )
        return;
      try {
        const message = JSON.parse(String(event.data)) as PeerMessage;
        if (
          message &&
          typeof message.id === "string" &&
          message.id.length > 0 &&
          message.id.length <= 128 &&
          typeof message.text === "string" &&
          message.text.length > 0 &&
          message.text.length <= 4000 &&
          typeof message.sentAt === "string" &&
          message.sentAt.length <= 40 &&
          Number.isFinite(Date.parse(message.sentAt))
        )
          options.onMessage({
            id: message.id,
            text: message.text,
            sentAt: message.sentAt,
            own: false,
          });
      } catch {
        // Ignore malformed data from an incompatible or stale peer.
      }
    };
  };

  const restartPeer = () => {
    const previous = peer;
    peer = new RTCPeerConnection(configuration);
    channel?.close();
    channel = null;
    previous.close();
    pendingCandidates.splice(0);
    const current = peer;
    if (initiator)
      attachChannel(peer.createDataChannel("peerly-chat", { ordered: true }));
    else
      peer.ondatachannel = (event) => {
        if (current === peer) attachChannel(event.channel);
      };
    peer.onicecandidate = (event) => {
      if (!isClosed && current === peer && event.candidate)
        sendSignal("ice", event.candidate.toJSON());
    };
    peer.onconnectionstatechange = () => {
      if (current === peer) void updateState();
    };
    options.onState("connecting");
  };
  let packetQueue = Promise.resolve();
  const handlePacket = async (event: MessageEvent) => {
    if (isClosed) return;
    let packet: { type?: string; data?: unknown };
    try {
      packet = JSON.parse(String(event.data)) as typeof packet;
    } catch {
      return;
    }
    if (!packet || typeof packet !== "object") return;
    if (packet.type === "ended") {
      options.onState("disconnected");
      isClosed = true;
      if (heartbeat) clearInterval(heartbeat);
      channel?.close();
      peer.close();
      signal.close();
      return;
    }
    if (packet.type === "peer-left") {
      channel?.close();
      peer.close();
      options.onState("disconnected");
      return;
    }
    if (packet.type === "ready") {
      restartPeer();
      if (initiator) {
        await peer
          .createOffer()
          .then((offer) => peer.setLocalDescription(offer))
          .then(() => {
            if (peer.localDescription)
              sendSignal("offer", peer.localDescription.toJSON());
          })
          .catch(() => options.onState("failed"));
      }
      return;
    }
    if (packet.type === "offer" && packet.data && !initiator) {
      const offer = packet.data as RTCSessionDescriptionInit;
      await peer
        .setRemoteDescription(offer)
        .then(async () => {
          for (const candidate of pendingCandidates.splice(0))
            await peer.addIceCandidate(candidate);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          if (peer.localDescription)
            sendSignal("answer", peer.localDescription.toJSON());
        })
        .catch(() => options.onState("failed"));
      return;
    }
    if (packet.type === "answer" && packet.data && initiator) {
      const answer = packet.data as RTCSessionDescriptionInit;
      await peer
        .setRemoteDescription(answer)
        .then(async () => {
          for (const candidate of pendingCandidates.splice(0))
            await peer.addIceCandidate(candidate);
        })
        .catch(() => options.onState("failed"));
      return;
    }
    if (packet.type === "ice" && packet.data) {
      const candidate = packet.data as RTCIceCandidateInit;
      if (peer.remoteDescription)
        await peer.addIceCandidate(candidate).catch(() => undefined);
      else if (pendingCandidates.length < 256)
        pendingCandidates.push(candidate);
    }
  };
  signal.onmessage = (event) => {
    packetQueue = packetQueue
      .then(() => handlePacket(event))
      .catch(() => {
        if (!isClosed) options.onState("failed");
      });
  };
  signal.onopen = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      if (signal.readyState === WebSocket.OPEN)
        signal.send(JSON.stringify({ type: "heartbeat" }));
    }, 8000);
  };
  signal.onerror = () => options.onState("failed");
  signal.onclose = () => {
    if (heartbeat) clearInterval(heartbeat);
    if (!isClosed) {
      isClosed = true;
      options.onState("disconnected");
      channel?.close();
      peer.close();
    }
  };

  return {
    send(text) {
      if (
        isClosed ||
        !channel ||
        channel.readyState !== "open" ||
        channel.bufferedAmount > 262144 ||
        !text.trim() ||
        text.length > 4000
      )
        return false;
      const message = {
        id: crypto.randomUUID(),
        text: text.trim(),
        sentAt: new Date().toISOString(),
      };
      try {
        channel.send(JSON.stringify(message));
        return true;
      } catch {
        return false;
      }
    },
    close() {
      isClosed = true;
      if (heartbeat) clearInterval(heartbeat);
      channel?.close();
      peer.close();
      if (
        signal.readyState === WebSocket.OPEN ||
        signal.readyState === WebSocket.CONNECTING
      )
        signal.close();
    },
  };
}
