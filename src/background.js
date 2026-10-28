import { verifyOnScreen } from "./verify.js";

const CAPTURE_FLAG = "__BRAND_GUIDE_EXTRACT__";

let captureGen = 0;

// Keep the click on our handler. A persisted "open the side panel" setting
// would swallow the click and dock the guide in Chrome's column instead of
// floating it over the page.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

chrome.action.onClicked.addListener((tab) => {
  openOverPage(tab);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "refresh") {
    refresh().then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: String(error?.message || error) })
    );
    return true;
  }
  if (message?.type === "open-guide") {
    const print = message.print ? "&print=1" : "";
    chrome.tabs.create({ url: chrome.runtime.getURL(`src/guide.html?view=full${print}`) });
    sendResponse({ ok: true });
  }
  return false;
});

async function openOverPage(tab) {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/overlay.js"] });
    const [ran] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (typeof globalThis.__brandGuideOverlay === "function" ? globalThis.__brandGuideOverlay() : "missing"),
    });
    if (ran?.result === "opened") capture(tab, { settle: 200 });
    else if (ran?.result !== "closed") await fail(tab, tab.url || "", "Brandprint couldn’t open over this page. Reload it, then click the icon again.");
  } catch (error) {
    await fail(tab, tab.url || "", readableError(error, tab.url || ""));
  }
}

async function refresh() {
  const stored = await chrome.storage.session.get(["brandGuide", "brandGuideStatus"]);
  const tabId = stored.brandGuide?.sourceTabId || stored.brandGuideStatus?.tabId;
  let tab = null;
  if (tabId) {
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      tab = null;
    }
  }
  if (!tab) {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tab = active || null;
  }
  if (!tab) throw new Error("No tab to read.");
  await capture(tab, { settle: 0 });
}

async function capture(tab, { settle }) {
  const gen = ++captureGen;
  const url = tab.url || "";

  await chrome.storage.session.set({ brandGuideStatus: { state: "loading", tabId: tab.id, url } });

  if (url && !/^https?:/i.test(url)) {
    await fail(tab, url, unsupportedMessage(url));
    return;
  }

  if (settle) await new Promise((resolve) => setTimeout(resolve, settle));

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/extract.js"] });
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (flag) => {
        const run = window[flag];
        return typeof run === "function" ? run() : null;
      },
      args: [CAPTURE_FLAG],
    });
    if (gen !== captureGen) return;
    const extracted = injected?.result;
    if (!extracted?.site) throw new Error("empty");

    const result = await checkOnScreen(tab, extracted);
    if (gen !== captureGen) return;

    const stored = await chrome.storage.session.get("brandGuide");
    const previous = stored.brandGuide;
    const sameHost = previous?.site?.host && previous.site.host === result.site.host;

    await chrome.storage.session.set({
      brandGuide: {
        ...result,
        picked: sameHost ? previous.picked || [] : [],
        sourceTabId: tab.id,
        capturedAt: new Date().toISOString(),
      },
      brandGuideStatus: { state: "ready", tabId: tab.id, url },
    });
  } catch (error) {
    if (gen !== captureGen) return;
    await fail(tab, url, readableError(error, url));
  }
}

async function checkOnScreen(tab, result) {
  try {
    const current = await chrome.tabs.get(tab.id);
    if (!current.active) return { ...result, verification: { state: "skipped" } };
    const dataUrl = await chrome.tabs.captureVisibleTab(current.windowId, { format: "png" });
    return await verifyOnScreen(result, dataUrl);
  } catch {
    return { ...result, verification: { state: "skipped" } };
  }
}

async function fail(tab, url, message) {
  await chrome.storage.session.set({
    brandGuide: null,
    brandGuideStatus: { state: "error", tabId: tab.id, url, message },
  });
}

function unsupportedMessage(url) {
  if (!url) return "Brandprint lost access to this tab after it changed. Click the Brandprint icon on the page again.";
  if (/^file:/i.test(url)) {
    return "Chrome blocks file:// pages unless “Allow access to file URLs” is on for Brandprint. Serve the page on localhost, then click the icon again.";
  }
  return "This page can’t be read. Open a normal website, or a page on localhost, then click the Brandprint icon.";
}

function readableError(error, url) {
  const text = String(error?.message || error || "");
  if (/cannot access|extensions gallery|chrome:\/\/|permission/i.test(text)) return unsupportedMessage(url);
  return "Brandprint couldn’t read this page. Reload it, then click the icon again.";
}
