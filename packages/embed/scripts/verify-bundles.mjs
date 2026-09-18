import { log } from "node:console";
import { readFile, stat } from "node:fs/promises";
import { URL } from "node:url";

import { JSDOM } from "jsdom";

const ESM_BUNDLE = new URL("../dist/agichat-widget.js", import.meta.url);
const IIFE_BUNDLE = new URL("../dist/agichat-widget.iife.js", import.meta.url);
const WIDGET_TAG = "agi-chat-widget";

const assertNonEmptyFile = async (file, label) => {
  const fileStats = await stat(file);

  if (!fileStats.isFile() || fileStats.size === 0) {
    throw new Error(`${label} bundle is missing or empty`);
  }

  return fileStats.size;
};

const esmSize = await assertNonEmptyFile(ESM_BUNDLE, "ESM");
const iifeSize = await assertNonEmptyFile(IIFE_BUNDLE, "IIFE");
const iifeSource = await readFile(IIFE_BUNDLE, "utf8");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  runScripts: "outside-only",
  url: "https://agichat.test"
});

try {
  dom.window.eval(iifeSource);

  const WidgetElement = dom.window.customElements.get(WIDGET_TAG);

  if (WidgetElement === undefined) {
    throw new Error(`IIFE bundle did not register <${WIDGET_TAG}>`);
  }

  const widget = dom.window.document.createElement(WIDGET_TAG);

  if (widget.shadowRoot === null) {
    throw new Error(`IIFE bundle could not construct <${WIDGET_TAG}>`);
  }
} finally {
  dom.window.close();
}

log(
  `Verified ESM (${esmSize} bytes) and standalone IIFE (${iifeSize} bytes) bundles.`
);
