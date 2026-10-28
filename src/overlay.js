(() => {
  const KEY = "__brandGuideOverlay";
  if (globalThis[KEY]) return;
  const session = Math.random().toString(36).slice(2);

  globalThis[KEY] = function toggleBrandGuide() {
    const existing = document.getElementById("brand-guide-host");
    if (existing?.dataset.session === session) {
      existing.remove();
      return "closed";
    }
    existing?.remove();

    const host = document.createElement("div");
    host.id = "brand-guide-host";
    host.dataset.session = session;
    host.setAttribute("popover", "manual");
    host.style.cssText = [
      "display:block",
      "position:fixed",
      "inset:0",
      "width:auto",
      "height:auto",
      "margin:0",
      "padding:0",
      "border:0",
      "background:transparent",
      "z-index:2147483646",
      "pointer-events:none",
    ].map((rule) => `${rule} !important`).join(";");
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .panel {
        position: fixed;
        z-index: 2147483646;
        top: 16px;
        right: 16px;
        bottom: 16px;
        left: auto;
        width: min(560px, calc(100% - 32px));
        border-radius: 18px;
        overflow: hidden;
        background: #f7f6f3;
        box-shadow: 0 24px 80px rgba(17, 17, 17, 0.28), 0 0 0 1px rgba(17, 17, 17, 0.08);
        pointer-events: auto;
      }
      .panel.is-max {
        left: 12px;
        right: 12px;
        width: auto;
        transform: none;
      }
      iframe {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: #f7f6f3;
      }
    `;

    const panel = document.createElement("div");
    panel.className = "panel";
    const frame = document.createElement("iframe");
    frame.title = "Brandprint";
    frame.setAttribute("allow", "clipboard-read; clipboard-write");
    frame.src = chrome.runtime.getURL("src/guide.html?embed=1");
    panel.append(frame);
    shadow.append(style, panel);
    (document.documentElement || document.body).append(host);
    try { host.showPopover(); } catch { /* Older pages keep the fixed host. */ }

    function onMessage(event) {
      if (event.source !== frame.contentWindow) return;
      if (!event.data || event.data.source !== "brand-guide") return;
      if (event.data.type === "close") {
        window.removeEventListener("message", onMessage);
        host.remove();
      } else if (event.data.type === "maximize") {
        panel.classList.toggle("is-max", Boolean(event.data.value));
      }
    }
    window.addEventListener("message", onMessage);
    return "opened";
  };
})();
