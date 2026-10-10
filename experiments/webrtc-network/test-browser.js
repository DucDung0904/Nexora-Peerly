// Evaluated in a fresh headless browser by test.ps1. Exercises the actual page UI.
(async () => {
  const results = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const wait = async (predicate, label, milliseconds = 15000) => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > milliseconds) throw new Error(`Timeout: ${label}`);
      await sleep(100);
    }
  };
  const frames = [];
  const makePage = async () => {
    const frame = document.createElement("iframe");
    const ready = new Promise((resolve) => frame.onload = resolve);
    frame.src = "/index.html";
    document.body.append(frame); frames.push(frame);
    await ready;
    const win = frame.contentWindow;
    const errors = [];
    win.addEventListener("error", (event) => errors.push(event.message));
    win.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));
    return { win, el: (id) => win.document.getElementById(id), errors };
  };
  let a, b;
  try {
    a = await makePage(); b = await makePage();
    assert(!a.el("self-test").disabled, "WebRTC APIs unavailable");
    a.el("self-test").click();
    await wait(() => a.el("notice").textContent.startsWith("PASS:"), "self-test ACK");
    await wait(() => a.el("messages").textContent.includes("B → A (tin chiều ngược lại)"), "reverse DataChannel message");
    await wait(() => a.el("route").textContent.includes("Direct"), "selected ICE pair");
    results.push({ test: "same-tab DataChannel + application ACK + reverse message", result: "PASS", pair: a.el("pair").textContent, traffic: a.el("traffic").textContent });

    a.el("reset").click();
    assert(a.el("send").disabled && a.el("outgoing").value === "", "reset did not clear state");
    a.el("incoming").value = "{invalid-json";
    a.el("answer").click();
    await wait(() => a.el("notice").textContent.includes("JSON hợp lệ"), "invalid JSON validation");
    assert(!a.el("offer").disabled, "invalid input blocked new offer");
    results.push({ test: "invalid signaling JSON rejected without starting a peer", result: "PASS" });

    a.el("network").value = "relay";
    a.el("self-test").click();
    await wait(() => a.el("notice").textContent.includes("TURN URL"), "missing TURN config");
    assert(!a.el("offer").disabled, "invalid TURN config started a peer");
    a.el("network").value = "local";
    results.push({ test: "forced relay requires TURN credentials", result: "PASS" });

    a.el("offer").click();
    await wait(() => a.el("outgoing").value.length > 0 && !a.el("apply").disabled, "offer ICE gathering");
    b.el("incoming").value = a.el("outgoing").value;
    b.el("answer").click();
    await wait(() => b.el("outgoing").value.length > 0, "answer ICE gathering");
    const validAnswer = b.el("outgoing").value;
    const wrongAnswer = JSON.parse(validAnswer); wrongAnswer.runId = "wrong-session";
    a.el("incoming").value = JSON.stringify(wrongAnswer);
    a.el("apply").click();
    await wait(() => a.el("notice").textContent.includes("không thuộc offer"), "wrong-session answer rejection");
    results.push({ test: "answer from another session rejected", result: "PASS" });
    a.el("incoming").value = validAnswer;
    a.el("apply").click();
    await wait(() => !a.el("send").disabled && !b.el("send").disabled, "two page DataChannels");
    const content = '<img src=x onerror="window.invalidMarkupExecuted=true"> Xin chào';
    a.el("message").value = content;
    a.el("send").click();
    await wait(() => a.el("messages").textContent.includes("peer trả ACK"), "A to B ACK");
    assert(b.el("messages").textContent.includes(content), "B did not receive exact payload");
    assert(!b.el("messages").querySelector("img") && !b.win.invalidMarkupExecuted, "message rendered as HTML");
    b.el("message").value = "Tin thử chiều B sang A";
    b.el("send").click();
    await wait(() => b.el("messages").textContent.includes("peer trả ACK"), "B to A ACK");
    assert(a.el("messages").textContent.includes("Tin thử chiều B sang A"), "A missing reverse message");
    await wait(() => a.el("route").textContent.includes("Direct"), "manual pair stats");
    results.push({ test: "two separate page contexts, manual offer/answer, messages + ACK both ways, HTML treated as text", result: "PASS", pair: a.el("pair").textContent });

    const before = a.el("messages").children.length;
    a.el("message").value = "🙂".repeat(1100);
    a.el("send").click();
    await wait(() => a.el("notice").textContent.includes("4096 byte"), "UTF-8 byte limit");
    assert(a.el("messages").children.length === before, "oversized message was sent");
    results.push({ test: "UTF-8 payload size limit enforced", result: "PASS" });

    let exported;
    const originalCreate = a.win.URL.createObjectURL;
    const originalClick = a.win.HTMLAnchorElement.prototype.click;
    a.win.URL.createObjectURL = (blob) => { exported = blob; return originalCreate.call(a.win.URL, blob); };
    a.win.HTMLAnchorElement.prototype.click = () => {};
    a.el("export").click();
    const report = JSON.parse(await exported.text());
    a.win.URL.createObjectURL = originalCreate;
    a.win.HTMLAnchorElement.prototype.click = originalClick;
    const serialized = JSON.stringify(report);
    assert(report.selectedCandidatePair?.route.includes("Direct"), "report missing route");
    assert(!serialized.includes(content) && !serialized.includes("a=candidate:") && !serialized.includes("a=ice-pwd:"), "report includes private payload/SDP");
    results.push({ test: "diagnostic export excludes message content and raw SDP", result: "PASS", report });

    b.el("reset").click();
    await wait(() => a.el("send").disabled, "remote close propagated");
    a.el("reset").click();
    a.el("self-test").click();
    await wait(() => a.el("notice").textContent.startsWith("PASS:"), "reconnect after reset");
    assert(a.errors.length === 0 && b.errors.length === 0, `Browser errors: ${a.errors.concat(b.errors).join(", ")}`);
    results.push({ test: "remote close disables send, fresh connection after reset, no unhandled browser errors", result: "PASS" });
    if (window.labCheckStun) {
      a.el("reset").click();
      a.el("network").value = "stun";
      a.el("offer").click();
      await wait(() => a.el("outgoing").value.length > 0 || a.el("notice").classList.contains("error"), "STUN gathering result", 23000);
      const output = a.el("outgoing").value;
      const counts = {};
      if (output) {
        const sdp = JSON.parse(output).description.sdp;
        for (const match of sdp.matchAll(/^a=candidate:.*? typ (\w+)/gm)) counts[match[1]] = (counts[match[1]] || 0) + 1;
      }
      results.push({
        test: "public STUN candidate gathering (not a two-network connection test)",
        result: counts.srflx ? "PASS" : "INCONCLUSIVE",
        candidateCounts: counts,
        interpretation: counts.srflx ? "Server-reflexive candidate gathered; no proof of successful NAT traversal to a remote device." : "No server-reflexive candidate observed; examine STUN reachability/browser policy. No conclusion about two-network connectivity.",
        gatheringCompleted: !!output,
        log: a.el("log").textContent
      });
    }
    return { result: "PASS", scope: "one headless browser on one Windows host; separate same-origin page contexts, not separate devices", browser: navigator.userAgent, results };
  } catch (error) {
    return { result: "FAIL", error: error.message, results, diagnostics: [a, b].filter(Boolean).map((page) => ({ notice: page.el("notice").textContent, log: page.el("log").textContent, errors: page.errors })) };
  } finally {
    for (const page of [a, b].filter(Boolean)) page.el("reset").click();
    for (const frame of frames) frame.remove();
  }
})()
