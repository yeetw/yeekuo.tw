import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extractInlineScript(html) {
  const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/);

  if (!match) {
    throw new Error("Inline script not found in index.html");
  }

  return match[1];
}

function createClassList(initial = []) {
  const classes = new Set(initial);

  return {
    add(...tokens) {
      for (const token of tokens) classes.add(token);
    },
    remove(...tokens) {
      for (const token of tokens) classes.delete(token);
    },
    contains(token) {
      return classes.has(token);
    },
    toString() {
      return [...classes].join(" ");
    },
  };
}

function createIcon() {
  return {
    className: "fa-regular fa-copy",
    dataset: {},
    textContent: "",
  };
}

function createButton(copyUrl, copyLabel) {
  const icon = createIcon();
  const listeners = new Map();

  return {
    dataset: {
      copyUrl,
      copyLabel,
    },
    classList: createClassList(["link-card__copy"]),
    icon,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    querySelector(selector) {
      return selector === "i" ? icon : null;
    },
    blurCalled: false,
    blur() {
      this.blurCalled = true;
    },
    async click() {
      const handler = listeners.get("click");

      if (!handler) {
        throw new Error("click handler not registered");
      }

      await handler();
    },
  };
}

function createTestContext(scriptSource) {
  const buttons = [
    createButton("https://read.yeekuo.tw", "read.yeekuo.tw"),
    createButton("https://drama.yeekuo.tw", "drama.yeekuo.tw"),
    createButton("https://run.yeekuo.tw", "run.yeekuo.tw"),
  ];

  const toast = {
    classList: createClassList(["copy-toast"]),
    textContent: "已複製連結",
  };

  const timeouts = [];
  let clipboardValue = null;

  const context = {
    navigator: {
      clipboard: {
        async writeText(value) {
          clipboardValue = value;
        },
      },
    },
    window: {
      isSecureContext: true,
    },
    document: {
      body: {
        appendChild() {},
      },
      querySelectorAll(selector) {
        return selector === ".link-card__copy" ? buttons : [];
      },
      querySelector(selector) {
        return selector === ".copy-toast" ? toast : null;
      },
      createElement() {
        return {
          value: "",
          style: {},
          setAttribute() {},
          select() {},
          remove() {},
        };
      },
      execCommand() {},
    },
    setTimeout(fn, delay) {
      const timer = { fn, delay, cleared: false };
      timeouts.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) {
        timer.cleared = true;
      }
    },
    console,
  };

  vm.createContext(context);
  vm.runInContext(scriptSource, context);

  return {
    buttons,
    toast,
    timeouts,
    getClipboardValue() {
      return clipboardValue;
    },
  };
}

test("clicking copy shows domain-specific toast for 1.5s and check state for 0.5s", async () => {
  const html = fs.readFileSync("/Users/yee/GitHub/yeekuo.tw/index.html", "utf8");
  const scriptSource = extractInlineScript(html);
  const { buttons, toast, timeouts, getClipboardValue } = createTestContext(scriptSource);

  await buttons[0].click();

  assert.equal(getClipboardValue(), "https://read.yeekuo.tw");
  assert.equal(toast.textContent, "read.yeekuo.tw 已複製");
  assert.equal(toast.classList.contains("is-visible"), true);
  assert.equal(buttons[0].classList.contains("is-copying"), true);
  assert.equal(buttons[0].icon.className, "fa-solid fa-check");
  assert.deepEqual(
    timeouts.map((timer) => timer.delay).sort((a, b) => a - b),
    [500, 1500],
  );

  const iconResetTimer = timeouts.find((timer) => timer.delay === 500);
  iconResetTimer.fn();
  assert.equal(buttons[0].icon.className, "fa-regular fa-copy");

  const toastTimer = timeouts.find((timer) => timer.delay === 1500);
  toastTimer.fn();
  assert.equal(toast.classList.contains("is-visible"), false);
  assert.equal(buttons[0].classList.contains("is-copying"), false);
  assert.equal(buttons[0].blurCalled, true);
});
