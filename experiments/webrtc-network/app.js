/* Isolated network spike: no app authentication, storage, or signaling backend. */
"use strict";
const $ = (id) => document.getElementById(id);
const encoder = new TextEncoder();
const MAX_TEXT_BYTES = 4096;
let peer = null, helper = null, channel = null, timer = null, deadline = null;
let generation = 0, busy = false, runId = null, kind = "none", configMode = "local";
let pending = new Map(), received = new Set(), messages = [], logs = [];
let selected = null, testResult = null, startedAt = null, probeStarted = 0;
let candidateCounts = {};

function log(text) {
  logs.push({ at: new Date().toISOString(), text });
  logs = logs.slice(-200);
  $("log").textContent = logs.map((item) => `${item.at.slice(11, 23)}  ${item.text}`).join("\n");
}
function notice(text, error = false) {
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
}
function refreshButtons() {
  for (const id of ["network", "stun", "turn", "turn-user", "turn-password", "self-test", "offer", "answer"]) {
    $(id).disabled = busy || !!peer;
  }
  $("apply").disabled = busy || !peer || kind !== "manual" || peer.signalingState !== "have-local-offer";
  $("send").disabled = !channel || channel.readyState !== "open";
}
function renderMessages() {
  $("messages").replaceChildren();
  for (const item of messages) {
    const li = document.createElement("li");
    li.textContent = `${item.direction === "out" ? "Bạn" : "Peer"}: ${item.text} — ${item.status}`;
    $("messages").append(li);
  }
}
function settings() {
  const mode = $("network").value;
  const iceServers = [];
  if (mode === "stun") {
    const url = $("stun").value.trim();
    if (!/^stuns?:\S+$/i.test(url)) throw new Error("Nhập STUN URL hợp lệ, bắt đầu bằng stun: hoặc stuns:.");
    iceServers.push({ urls: url });
  }
  if (mode === "relay") {
    const url = $("turn").value.trim();
    const username = $("turn-user").value.trim();
    const credential = $("turn-password").value;
    if (!/^turns?:\S+$/i.test(url) || !username || !credential) {
      throw new Error("Chế độ relay cần TURN URL, username và credential của máy chủ TURN đang hoạt động.");
    }
    iceServers.push({ urls: url, username, credential });
  }
  return { iceServers, iceTransportPolicy: mode === "relay" ? "relay" : "all" };
}
function reset() {
  generation++;
  clearInterval(timer); clearTimeout(deadline);
  timer = null; deadline = null;
  for (const item of pending.values()) clearTimeout(item.timeout);
  pending.clear(); received.clear();
  if (channel) channel.close();
  if (peer) peer.close();
  if (helper) helper.close();
  channel = null; peer = null; helper = null; busy = false; kind = "none";
  selected = null; testResult = null; startedAt = null; runId = null;
  candidateCounts = {};
  messages = []; logs = []; renderMessages();
  $("log").textContent = "";
  for (const id of ["connection", "ice", "channel"]) $(id).textContent = "—";
  $("route").textContent = "Chưa xác định";
  $("candidates").textContent = "Candidate cục bộ: chưa thu thập.";
  $("pair").textContent = "Chưa có candidate pair được chọn.";
  $("traffic").textContent = "Chưa có số liệu.";
  $("scope").textContent = "Chưa chạy thử nghiệm.";
  $("outgoing").value = ""; $("incoming").value = "";
  notice("Đã đóng kết nối. Có thể chọn cấu hình và thử lại.");
  refreshButtons();
}
function updateState() {
  $("connection").textContent = peer?.connectionState || "—";
  $("ice").textContent = peer ? `${peer.iceConnectionState} / ${peer.iceGatheringState}` : "—";
  $("channel").textContent = channel?.readyState || "—";
  refreshButtons();
}
function begin(configuration, scope, id = crypto.randomUUID()) {
  reset();
  startedAt = new Date().toISOString();
  runId = id; kind = scope; configMode = $("network").value;
  const token = generation;
  peer = new RTCPeerConnection(configuration);
  peer.onicecandidate = (event) => {
    if (token !== generation) return;
    if (event.candidate) {
      const type = event.candidate.type || "unknown";
      candidateCounts[type] = (candidateCounts[type] || 0) + 1;
    }
    $("candidates").textContent = `Candidate cục bộ: ${Object.entries(candidateCounts).map(([type, count]) => `${type}: ${count}`).join(" · ") || "0"}. Có candidate chưa có nghĩa đã kết nối.`;
  };
  $("scope").textContent = scope === "self"
    ? "Phạm vi: hai peer trong cùng tab/máy. Kết quả không chứng minh đường mạng giữa hai thiết bị."
    : "Phạm vi: hai peer trao đổi mã thủ công. Ghi rõ hai tab, hai máy LAN hay hai mạng khi lưu kết quả.";
  for (const event of ["connectionstatechange", "iceconnectionstatechange", "icegatheringstatechange", "signalingstatechange"]) {
    peer.addEventListener(event, () => {
      if (token !== generation) return;
      updateState();
      log(`${event}: ${peer.connectionState} / ICE ${peer.iceConnectionState} / gathering ${peer.iceGatheringState}`);
      if (peer.connectionState === "failed") notice("Kết nối thất bại. Kiểm tra mạng, mã kết nối và thử STUN/TURN phù hợp.", true);
      if (peer.connectionState === "disconnected") notice("Đường truyền đang gián đoạn; chưa thể xác nhận tin mới đã đến peer.", true);
    });
  }
  peer.addEventListener("icecandidateerror", (event) => {
    if (token === generation) log(`ICE server error ${event.errorCode}. Không ghi địa chỉ/credential vào log.`);
  });
  peer.ondatachannel = (event) => { if (token === generation) attachChannel(event.channel, token); };
  timer = setInterval(() => { collectStats(token).catch(() => {}); }, 1000);
  updateState();
  log(`Bắt đầu ${scope === "self" ? "self-test" : "manual test"}; cấu hình ${configMode}.`);
  return token;
}
function attachChannel(dc, token) {
  channel = dc;
  dc.onopen = () => {
    if (token !== generation) return;
    clearTimeout(deadline);
    notice("DataChannel đã mở. Hãy gửi tin và chờ ACK từ peer.");
    log("DataChannel OPEN; sẵn sàng gửi dữ liệu.");
    updateState();
    collectStats(token).catch(() => {});
    if (kind === "self") {
      probeStarted = performance.now();
      sendText("M0 self-test: A → B → ACK", true);
    }
  };
  dc.onclose = () => {
    if (token !== generation) return;
    for (const [id, item] of pending) {
      clearTimeout(item.timeout);
      item.message.status = "Chưa xác nhận — DataChannel đóng";
      pending.delete(id);
    }
    renderMessages(); updateState(); log("DataChannel CLOSED.");
    notice("DataChannel đã đóng. Bấm Đóng / làm lại để tạo phiên mới.", true);
  };
  dc.onerror = () => { if (token === generation) log("DataChannel báo lỗi."); };
  dc.onmessage = (event) => {
    if (token !== generation) return;
    handlePacket(dc, event.data, false);
  };
  updateState();
}
function parsePacket(raw) {
  if (typeof raw !== "string" || encoder.encode(raw).length > 8192) throw new Error("Gói tin quá lớn hoặc không phải văn bản.");
  const packet = JSON.parse(raw);
  if (!packet || packet.runId !== runId || typeof packet.id !== "string" || packet.id.length > 80) throw new Error("Sai phiên hoặc định dạng gói tin.");
  if (!["CHAT_MESSAGE", "CHAT_ACK"].includes(packet.type)) throw new Error("Loại gói tin không hỗ trợ.");
  if (packet.type === "CHAT_MESSAGE" && (typeof packet.text !== "string" || encoder.encode(packet.text).length > MAX_TEXT_BYTES)) throw new Error("Nội dung không hợp lệ.");
  return packet;
}
function handlePacket(dc, raw, echoPeer) {
  try {
    const packet = parsePacket(raw);
    if (packet.type === "CHAT_MESSAGE") {
      if (!received.has(packet.id)) {
        received.add(packet.id);
        if (received.size > 500) received.delete(received.values().next().value);
        if (!echoPeer) {
          messages.push({ id: packet.id, direction: "in", text: packet.text, status: "Đã nhận qua DataChannel" });
          messages = messages.slice(-100); renderMessages();
        }
        log(`${echoPeer ? "Peer B thử nghiệm" : "Peer hiện tại"} nhận CHAT_MESSAGE qua DataChannel.`);
      }
      dc.send(JSON.stringify({ type: "CHAT_ACK", runId, id: packet.id }));
      if (echoPeer && packet.probe) {
        dc.send(JSON.stringify({ type: "CHAT_MESSAGE", runId, id: crypto.randomUUID(), text: "M0 self-test: B → A (tin chiều ngược lại)" }));
      }
    } else {
      const item = pending.get(packet.id);
      if (!item) return;
      clearTimeout(item.timeout); pending.delete(packet.id);
      item.message.status = "Đã nhận — peer trả ACK";
      log("Nhận CHAT_ACK qua DataChannel.");
      renderMessages();
      if (item.probe) {
        testResult = { result: "PASS", ackRoundTripMs: Math.round((performance.now() - probeStarted) * 100) / 100, scope: "same-tab-only" };
        notice("PASS: A gửi → B nhận → A nhận ACK qua DataChannel. Đây là kiểm tra cùng máy, chưa phải kiểm tra hai mạng.");
        log("SELF-TEST PASS: nhận ACK ứng dụng.");
      }
    }
  } catch { log("Bỏ qua gói tin không hợp lệ hoặc không thể gửi ACK."); }
}
function sendText(text, probe = false) {
  if (!channel || channel.readyState !== "open") throw new Error("DataChannel chưa mở.");
  if (!text.trim() || encoder.encode(text).length > MAX_TEXT_BYTES) throw new Error("Nhập nội dung không rỗng, tối đa 4096 byte UTF-8.");
  if (channel.bufferedAmount > 65536) throw new Error("Bộ đệm đang đầy; chờ trước khi gửi tiếp.");
  if (pending.size >= 50) throw new Error("Đang có quá nhiều tin chờ ACK; hãy chờ kết quả.");
  const id = crypto.randomUUID();
  channel.send(JSON.stringify({ type: "CHAT_MESSAGE", runId, id, text, probe }));
  const message = { id, direction: "out", text, status: "Đã gửi vào kênh — chờ ACK" };
  messages.push(message); messages = messages.slice(-100);
  const token = generation;
  const timeout = setTimeout(() => {
    if (token !== generation) return;
    pending.delete(id);
    message.status = "Chưa xác nhận — quá hạn ACK 10 giây";
    if (probe) {
      testResult = { result: "FAIL", reason: "ack-timeout", scope: "same-tab-only" };
      notice("Self-test chưa nhận được ACK sau 10 giây; chưa thể xác nhận truyền tin thành công.", true);
    }
    renderMessages(); log("ACK timeout; không đánh dấu đã nhận.");
  }, 10000);
  pending.set(id, { message, timeout, probe });
  renderMessages(); log("Gửi CHAT_MESSAGE qua DataChannel.");
}
function gather(pc, token) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timeout); clearInterval(cancelCheck);
      pc.removeEventListener("icegatheringstatechange", check);
      error ? reject(error) : resolve();
    };
    const check = () => { if (pc.iceGatheringState === "complete") finish(); };
    const timeout = setTimeout(() => finish(new Error("ICE gathering quá 20 giây. Chưa xuất mã thiếu candidate; kiểm tra STUN/TURN rồi làm lại.")), 20000);
    const cancelCheck = setInterval(() => { if (token !== generation) finish(new Error("Đã hủy thử nghiệm.")); }, 100);
    pc.addEventListener("icegatheringstatechange", check);
    check();
  });
}
function ensureCurrent(token) { if (token !== generation) throw new Error("Đã hủy thử nghiệm."); }
function encodeDescription(pc) {
  return JSON.stringify({ version: 1, runId, description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
}
function readDescription(expected) {
  const raw = $("incoming").value.trim();
  if (!raw || raw.length > 100000) throw new Error("Dán đầy đủ mã JSON, tối đa 100 KB.");
  let code;
  try { code = JSON.parse(raw); } catch { throw new Error("Mã kết nối không phải JSON hợp lệ."); }
  if (!code || code.version !== 1 || typeof code.runId !== "string" || !/^[\w-]{1,80}$/.test(code.runId) || code.description?.type !== expected || typeof code.description.sdp !== "string" || !code.description.sdp.startsWith("v=0")) {
    throw new Error(`Cần mã ${expected} hợp lệ từ bản thử này.`);
  }
  return code;
}
function startDeadline(token) {
  clearTimeout(deadline);
  deadline = setTimeout(() => {
    if (token !== generation || channel?.readyState === "open") return;
    testResult = { result: "INCONCLUSIVE", reason: "connection-timeout", scope: kind };
    notice("Chưa mở DataChannel sau 30 giây. Kiểm tra A đã nhận answer, cấu hình STUN/TURN và mạng. Kết nối có thể vẫn đang thử.", true);
    log("Quá thời gian chờ DataChannel 30 giây.");
  }, 30000);
}
async function collectStats(token) {
  if (!peer || token !== generation) return;
  const stats = await peer.getStats();
  if (token !== generation) return;
  let pair;
  for (const row of stats.values()) {
    if (row.type === "transport" && row.selectedCandidatePairId) pair = stats.get(row.selectedCandidatePairId);
  }
  if (!pair) {
    for (const row of stats.values()) {
      if (row.type === "candidate-pair" && row.state === "succeeded" && row.nominated) { pair = row; break; }
    }
  }
  if (!pair) return;
  const local = stats.get(pair.localCandidateId), remote = stats.get(pair.remoteCandidateId);
  const localType = local?.candidateType || "unknown", remoteType = remote?.candidateType || "unknown";
  const relay = localType === "relay" || remoteType === "relay";
  const route = relay ? "TURN relay" : localType !== "unknown" && remoteType !== "unknown" ? "Direct (không TURN)" : "Chưa đủ thông tin";
  selected = {
    route, localType, remoteType, protocol: local?.protocol || "unknown",
    currentRoundTripTimeMs: typeof pair.currentRoundTripTime === "number" ? Math.round(pair.currentRoundTripTime * 100000) / 100 : null,
    bytesSent: pair.bytesSent || 0, bytesReceived: pair.bytesReceived || 0,
    sampledAt: new Date().toISOString()
  };
  $("route").textContent = route;
  $("pair").textContent = `Candidate đã chọn: ${localType} ↔ ${remoteType} · ${selected.protocol}. Không hiển thị địa chỉ IP.`;
  $("traffic").textContent = `ICE RTT: ${selected.currentRoundTripTimeMs ?? "—"} ms · Gửi: ${selected.bytesSent} B · Nhận: ${selected.bytesReceived} B (thống kê candidate pair, không chỉ payload chat).`;
}
async function selfTest() {
  const configuration = settings();
  const token = begin(configuration, "self");
  busy = true; refreshButtons();
  notice("Đang tự thử: tạo hai peer, thu thập ICE và trao đổi SDP trong bộ nhớ tab…");
  const a = peer, b = new RTCPeerConnection(configuration);
  helper = b;
  b.ondatachannel = (event) => {
    event.channel.onmessage = (message) => { if (token === generation) handlePacket(event.channel, message.data, true); };
  };
  attachChannel(a.createDataChannel("nexory-network-test", { ordered: true }), token);
  await a.setLocalDescription(await a.createOffer());
  await gather(a, token); ensureCurrent(token);
  await b.setRemoteDescription(a.localDescription);
  await b.setLocalDescription(await b.createAnswer());
  await gather(b, token); ensureCurrent(token);
  await a.setRemoteDescription(b.localDescription);
  ensureCurrent(token); startDeadline(token);
}
async function createOffer() {
  const configuration = settings();
  const token = begin(configuration, "manual");
  busy = true; refreshButtons();
  notice("Đang tạo offer và chờ ICE gathering hoàn tất…");
  const pc = peer;
  attachChannel(pc.createDataChannel("nexory-network-test", { ordered: true }), token);
  await pc.setLocalDescription(await pc.createOffer());
  await gather(pc, token); ensureCurrent(token);
  $("outgoing").value = encodeDescription(pc);
  notice("Offer sẵn sàng. Gửi toàn bộ mã cho B; sau đó dán answer của B vào ô nhập.");
  log("Xuất offer có ICE candidates; không ghi SDP vào nhật ký.");
}
async function createAnswer() {
  const code = readDescription("offer"), configuration = settings();
  const token = begin(configuration, "manual", code.runId);
  busy = true; refreshButtons();
  notice("Đang nhận offer, tạo answer và chờ ICE gathering…");
  const pc = peer;
  await pc.setRemoteDescription(code.description);
  await pc.setLocalDescription(await pc.createAnswer());
  await gather(pc, token); ensureCurrent(token);
  $("outgoing").value = encodeDescription(pc);
  notice("Answer sẵn sàng. Gửi mã cho A và yêu cầu A bấm Nhận answer.");
  log("Xuất answer có ICE candidates; chờ A áp dụng.");
  // No connection timeout yet: the human may need time to transfer this code.
}
async function applyAnswer() {
  const code = readDescription("answer");
  if (!peer || peer.signalingState !== "have-local-offer" || code.runId !== runId) throw new Error("Answer không thuộc offer hiện tại. Kiểm tra đúng cặp và thử lại.");
  const token = generation;
  busy = true; refreshButtons();
  await peer.setRemoteDescription(code.description);
  ensureCurrent(token); startDeadline(token);
  notice("Đã nhận answer. Đang chờ ICE và DataChannel kết nối…");
}
async function action(fn) {
  if (busy) return;
  let actionGeneration = generation;
  try {
    const operation = fn();
    actionGeneration = generation;
    await operation;
  }
  catch (error) {
    // Browser exceptions can contain SDP or server URLs. Only our fixed messages are surfaced.
    const text = error instanceof DOMException ? `WebRTC báo ${error.name}. Kiểm tra mã/cấu hình rồi bấm Đóng / làm lại.` : error.message;
    if (actionGeneration === generation && text !== "Đã hủy thử nghiệm.") { notice(text, true); log(text); }
  } finally { if (actionGeneration === generation) { busy = false; refreshButtons(); } }
}
$("self-test").onclick = () => action(selfTest);
$("offer").onclick = () => action(createOffer);
$("answer").onclick = () => action(createAnswer);
$("apply").onclick = () => action(applyAnswer);
$("reset").onclick = reset;
$("chat-form").onsubmit = (event) => { event.preventDefault(); action(() => sendText($("message").value)); };
$("export").onclick = () => {
  const report = {
    version: 1, exportedAt: new Date().toISOString(), startedAt, mode: kind, iceMode: configMode,
    scopeWarning: "Self-test chỉ chạy cùng máy. Manual cần tự ghi rõ thiết bị/mạng. Không suy ra NAT traversal từ self-test.",
    browser: navigator.userAgent, secureContext: window.isSecureContext,
    state: { connection: peer?.connectionState || null, ice: peer?.iceConnectionState || null, channel: channel?.readyState || null },
    localCandidateCounts: candidateCounts, selectedCandidatePair: selected, selfTest: testResult,
    messageResults: messages.map(({ direction, status }) => ({ direction, status })),
    logs,
    omitted: "Không xuất nội dung chat, SDP, địa chỉ IP, URL ICE server hoặc TURN credential."
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `webrtc-report-${Date.now()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener("pagehide", () => { if (peer) peer.close(); if (helper) helper.close(); clearInterval(timer); clearTimeout(deadline); });
if (!window.RTCPeerConnection || !window.crypto?.randomUUID) {
  notice("Trình duyệt hoặc context chưa hỗ trợ API cần thiết. Hãy mở bằng Chrome/Edge trên http://localhost hoặc HTTPS.", true);
  for (const id of ["self-test", "offer", "answer", "apply", "reset"]) $(id).disabled = true;
} else { refreshButtons(); log("Sẵn sàng; chưa tạo kết nối và chưa gọi STUN/TURN."); }
