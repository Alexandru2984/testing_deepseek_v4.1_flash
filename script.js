"use strict";

/* ---------------------------------------------------------------
   Elements
   --------------------------------------------------------------- */
const input = document.getElementById("inputJson");
const output = document.getElementById("outputJson");
const inputGutter = document.getElementById("inputGutter");
const outputGutter = document.getElementById("outputGutter");
const inputMeta = document.getElementById("inputMeta");
const outputMeta = document.getElementById("outputMeta");
const inputPanel = document.getElementById("inputPanel");
const outputMode = document.getElementById("outputMode");
const staleChip = document.getElementById("staleChip");
const copyBtn = document.getElementById("copyBtn");
const copyLabel = document.getElementById("copyLabel");
const formatBtn = document.getElementById("formatBtn");
const minifyBtn = document.getElementById("minifyBtn");
const validateBtn = document.getElementById("validateBtn");
const exampleBtn = document.getElementById("exampleBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBar = document.getElementById("status");
const statusTitle = document.getElementById("statusTitle");
const statusDetail = document.getElementById("statusDetail");
const statusLocation = document.getElementById("statusLocation");
const announcer = document.getElementById("announcer");

const numberFormat = new Intl.NumberFormat("en-US");

const DEFAULT_STATUS = {
  title: "Ready when you are",
  detail: "Paste JSON, then press Format or use the keyboard shortcut.",
};

const EXAMPLE_JSON = `{
  "project": "aurora-console",
  "version": "2.4.0",
  "private": false,
  "owner": {
    "name": "Mira Chen",
    "email": "mira@example.com",
    "timezone": "Asia/Singapore"
  },
  "features": {
    "darkMode": true,
    "analytics": false,
    "maxUploadMb": 25,
    "betaFlags": ["command-palette", "live-cursors"]
  },
  "environments": [
    { "name": "development", "url": "http://localhost:3000", "autoDeploy": true },
    { "name": "staging", "url": "https://staging.example.com", "autoDeploy": true },
    { "name": "production", "url": "https://app.example.com", "autoDeploy": false }
  ],
  "maintainers": [
    { "name": "Noah Williams", "role": "frontend" },
    { "name": "Priya Raman", "role": "backend" },
    { "name": "Luca Moretti", "role": "design" }
  ],
  "limits": {
    "requestsPerMinute": 120,
    "burst": 300,
    "retryAfterSeconds": 30
  },
  "lastDeploy": "2026-11-18T09:42:00Z",
  "notes": null
}`;

/* ---------------------------------------------------------------
   JSON parsing and formatting
   --------------------------------------------------------------- */

/**
 * Re-indent valid JSON without changing its values, key order, number
 * spellings, or duplicate keys.
 */
function formatJson(text) {
  const indent = "  ";
  let result = "";
  let depth = 0;
  let inString = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      result += char;
      if (char === "\\") {
        if (i + 1 < text.length) {
          result += text[i + 1];
          i += 1;
        }
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === " " || char === "\n" || char === "\r" || char === "\t") {
      continue;
    }

    if (char === "{" || char === "[") {
      const closing = char === "{" ? "}" : "]";
      let lookahead = i + 1;
      while (lookahead < text.length && " \n\r\t".includes(text[lookahead])) {
        lookahead += 1;
      }

      if (text[lookahead] === closing) {
        result += char + closing;
        i = lookahead;
        continue;
      }

      result += char + "\n";
      depth += 1;
      result += indent.repeat(depth);
      continue;
    }

    if (char === "}" || char === "]") {
      depth = Math.max(0, depth - 1);
      result += "\n" + indent.repeat(depth) + char;
      continue;
    }

    if (char === ",") {
      result += ",\n" + indent.repeat(depth);
      continue;
    }

    if (char === ":") {
      result += ": ";
      continue;
    }

    result += char;
  }

  return result;
}

/** Remove whitespace that appears outside JSON strings. */
function minifyJson(text) {
  let result = "";
  let inString = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      result += char;
      if (char === "\\") {
        if (i + 1 < text.length) {
          result += text[i + 1];
          i += 1;
        }
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === " " || char === "\n" || char === "\r" || char === "\t") {
      continue;
    }

    result += char;
  }

  return result;
}

const NUMBER_PATTERN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/**
 * Scan text that JSON.parse has already rejected and find the first syntax
 * error. Returns { message, index } or null if no problem is found.
 */
function findJsonError(text) {
  let index = 0;
  const length = text.length;

  if (text.charCodeAt(0) === 0xfeff) {
    return {
      message: "Remove the byte order mark (BOM) at the start of the text.",
      index: 0,
    };
  }

  const fail = (message, at = index) => {
    const error = new Error(message);
    error.index = at;
    throw error;
  };

  const skipWhitespace = () => {
    while (index < length && " \n\r\t".includes(text[index])) {
      index += 1;
    }
  };

  const describeChar = (char) => {
    if (char === undefined) return "the end of the input";
    if (char === "\n") return "a line break";
    if (char === "\r") return "a carriage return";
    if (char === "\t") return "a tab";
    return `'${char}'`;
  };

  const parseString = () => {
    const start = index;
    index += 1;

    while (index < length) {
      const char = text[index];

      if (char === '"') {
        index += 1;
        return;
      }

      if (char === "\\") {
        const escapeStart = index;
        index += 1;
        const escape = text[index];

        if (escape === undefined) {
          fail("This string is missing its closing quote.", start);
        }

        if (escape === "u") {
          const hex = text.slice(index + 1, index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            fail("Invalid unicode escape. Expected four hex digits after \\u.", escapeStart);
          }
          index += 5;
        } else if ('"\\/bfnrt'.includes(escape)) {
          index += 1;
        } else {
          fail(`Invalid escape sequence '\\${escape}'.`, escapeStart);
        }
        continue;
      }

      if (char.charCodeAt(0) < 0x20) {
        fail("Control characters must be escaped inside strings.", index);
      }

      index += 1;
    }

    fail("This string is missing its closing quote.", start);
  };

  const parseNumber = () => {
    NUMBER_PATTERN.lastIndex = index;
    const match = NUMBER_PATTERN.exec(text);

    if (!match) {
      fail("This number is not valid JSON.", index);
    }

    const end = index + match[0].length;
    const next = text[end];
    if (next !== undefined && /[0-9A-Za-z.+-]/.test(next)) {
      fail("This number is not valid JSON.", index);
    }

    index = end;
  };

  const parseObject = () => {
    index += 1;
    skipWhitespace();

    if (text[index] === "}") {
      index += 1;
      return;
    }

    while (true) {
      skipWhitespace();

      if (index >= length) {
        fail("Unexpected end of input. Expected a property name or '}'.", index);
      }

      if (text[index] === "}") {
        fail("Trailing commas are not allowed before '}'.", index);
      }

      if (text[index] === "'") {
        fail("Property names and strings must use double quotes.", index);
      }

      if (text[index] !== '"') {
        fail("Property names must be wrapped in double quotes.", index);
      }

      parseString();
      skipWhitespace();

      if (text[index] !== ":") {
        fail(
          index >= length
            ? "Unexpected end of input. Expected ':' after the property name."
            : `Expected ':' after the property name but found ${describeChar(text[index])}.`,
          index
        );
      }

      index += 1;
      parseValue();
      skipWhitespace();

      if (index >= length) {
        fail("Unexpected end of input. Expected ',' or '}'.", index);
      }

      if (text[index] === ",") {
        index += 1;
        skipWhitespace();
        if (text[index] === "}") {
          fail("Trailing commas are not allowed before '}'.", index);
        }
        continue;
      }

      if (text[index] === "}") {
        index += 1;
        return;
      }

      fail(`Expected ',' or '}' but found ${describeChar(text[index])}.`, index);
    }
  };

  const parseArray = () => {
    index += 1;
    skipWhitespace();

    if (text[index] === "]") {
      index += 1;
      return;
    }

    while (true) {
      parseValue();
      skipWhitespace();

      if (index >= length) {
        fail("Unexpected end of input. Expected ',' or ']'.", index);
      }

      if (text[index] === ",") {
        index += 1;
        skipWhitespace();
        if (text[index] === "]") {
          fail("Trailing commas are not allowed before ']'.", index);
        }
        continue;
      }

      if (text[index] === "]") {
        index += 1;
        return;
      }

      fail(`Expected ',' or ']' but found ${describeChar(text[index])}.`, index);
    }
  };

  function parseValue() {
    skipWhitespace();

    if (index >= length) {
      fail("Unexpected end of input. Expected a value.", index);
    }

    const char = text[index];

    if (char === "{") return parseObject();
    if (char === "[") return parseArray();
    if (char === '"') return parseString();
    if (char === "-" || (char >= "0" && char <= "9")) return parseNumber();

    if (char === "'") {
      fail("Strings must use double quotes, not single quotes.", index);
    }

    if (char === "/") {
      fail("Comments are not allowed in JSON.", index);
    }

    if (text.startsWith("true", index)) {
      index += 4;
      return;
    }
    if (text.startsWith("false", index)) {
      index += 5;
      return;
    }
    if (text.startsWith("null", index)) {
      index += 4;
      return;
    }
    if (text.startsWith("undefined", index)) {
      fail("undefined is not valid JSON. Use null instead.", index);
    }
    if (text.startsWith("NaN", index) || text.startsWith("Infinity", index)) {
      fail("NaN and Infinity are not valid JSON numbers.", index);
    }

    fail(`Unexpected character ${describeChar(char)}. Expected a value.`, index);
  }

  try {
    parseValue();
    skipWhitespace();

    if (index < length) {
      fail(`Unexpected content after the JSON value: ${describeChar(text[index])}.`, index);
    }

    return null;
  } catch (error) {
    if (typeof error.index === "number") {
      return { message: error.message, index: error.index };
    }
    throw error;
  }
}

/** Convert a character offset into a 1-based line and column. */
function positionFromIndex(text, index) {
  const safeIndex = Math.max(0, Math.min(index, text.length));
  let line = 1;
  let lineStart = 0;

  for (let i = 0; i < safeIndex; i += 1) {
    if (text[i] === "\n") {
      line += 1;
      lineStart = i + 1;
    }
  }

  return { line, column: safeIndex - lineStart + 1 };
}

function positionFromBrowserMessage(text, message) {
  let match = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (match) {
    return { line: Number(match[1]), column: Number(match[2]) };
  }

  match = message.match(/position\s+(\d+)/i);
  if (match) {
    return positionFromIndex(text, Number(match[1]));
  }

  return null;
}

function cleanBrowserMessage(message) {
  return message
    .replace(/^JSON\.parse:\s*/i, "")
    .replace(/\s+of the JSON data\.?$/i, "")
    .replace(/\.$/, "");
}

/** Validate with the browser first, then locate any failure ourselves. */
function parseInput(text) {
  try {
    JSON.parse(text);
    return { ok: true };
  } catch (error) {
    const located = findJsonError(text);

    if (located) {
      const position = positionFromIndex(text, located.index);
      return {
        ok: false,
        message: located.message,
        line: position.line,
        column: position.column,
      };
    }

    const fallback = positionFromBrowserMessage(text, error.message);
    return {
      ok: false,
      message: cleanBrowserMessage(error.message) || "The JSON could not be parsed.",
      line: fallback ? fallback.line : null,
      column: fallback ? fallback.column : null,
    };
  }
}

/* ---------------------------------------------------------------
   UI state helpers
   --------------------------------------------------------------- */
let lastOutputSource = null;
let statusIsDefault = true;
let copyResetTimer = 0;
let inputFrame = 0;

function describeText(text) {
  const lines = text.split("\n").length;
  const chars = text.length;
  return `${numberFormat.format(lines)} ${lines === 1 ? "line" : "lines"} · ${numberFormat.format(chars)} ${
    chars === 1 ? "char" : "chars"
  }`;
}

function setStatus(state, title, detail, location = "") {
  statusBar.dataset.state = state;
  statusTitle.textContent = title;
  statusDetail.textContent = detail;

  if (location) {
    statusLocation.textContent = location;
    statusLocation.hidden = false;
  } else {
    statusLocation.textContent = "";
    statusLocation.hidden = true;
  }

  statusIsDefault = false;
}

function setDefaultStatus() {
  if (statusIsDefault) return;
  statusBar.dataset.state = "idle";
  statusTitle.textContent = DEFAULT_STATUS.title;
  statusDetail.textContent = DEFAULT_STATUS.detail;
  statusLocation.textContent = "";
  statusLocation.hidden = true;
  statusIsDefault = true;
}

function announce(message) {
  announcer.textContent = "";
  requestAnimationFrame(() => {
    announcer.textContent = message;
  });
}

function renderGutter(textarea, gutter) {
  const lineCount = textarea.value.split("\n").length;
  const fragment = document.createDocumentFragment();

  for (let line = 1; line <= lineCount; line += 1) {
    const number = document.createElement("span");
    number.textContent = String(line);
    fragment.appendChild(number);
  }

  gutter.replaceChildren(fragment);
  gutter.scrollTop = textarea.scrollTop;
}

function updateInputMeta() {
  inputMeta.textContent = describeText(input.value);
}

function updateStaleChip() {
  staleChip.hidden = !(output.value && input.value !== lastOutputSource);
}

/** Bring the gutter and metadata up to date, cancelling any queued render. */
function flushInputRender() {
  if (inputFrame) {
    cancelAnimationFrame(inputFrame);
    inputFrame = 0;
  }

  updateInputMeta();
  renderGutter(input, inputGutter);
  updateStaleChip();
}

function clearErrorState() {
  if (!inputPanel.classList.contains("has-error")) return;

  inputPanel.classList.remove("has-error");
  input.removeAttribute("aria-invalid");

  for (const number of inputGutter.querySelectorAll(".error")) {
    number.classList.remove("error");
  }
}

function markErrorLine(line) {
  for (const number of inputGutter.querySelectorAll(".error")) {
    number.classList.remove("error");
  }

  const number = inputGutter.children[line - 1];
  if (number) number.classList.add("error");
}

function scrollLineIntoView(textarea, line) {
  const styles = getComputedStyle(textarea);
  const lineHeight = parseFloat(styles.lineHeight) || 21;
  const paddingTop = parseFloat(styles.paddingTop) || 12;
  const top = paddingTop + (line - 1) * lineHeight;

  if (top < textarea.scrollTop || top + lineHeight > textarea.scrollTop + textarea.clientHeight) {
    textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 3);
  }
}

function showError(result) {
  const location =
    result.line && result.column
      ? `Line ${numberFormat.format(result.line)}, column ${numberFormat.format(result.column)}`
      : "";

  setStatus("error", "Invalid JSON", result.message, location);
  inputPanel.classList.add("has-error");
  input.setAttribute("aria-invalid", "true");

  if (result.line) {
    markErrorLine(result.line);
    scrollLineIntoView(input, result.line);
    inputGutter.scrollTop = input.scrollTop;
  }
}

function resetCopyButton() {
  window.clearTimeout(copyResetTimer);
  copyBtn.classList.remove("is-copied");
  copyLabel.textContent = "Copy";
}

function showCopySuccess() {
  window.clearTimeout(copyResetTimer);
  copyBtn.classList.add("is-copied");
  copyLabel.textContent = "Copied";
  copyResetTimer = window.setTimeout(resetCopyButton, 1800);
}

function showOutput(text, mode) {
  output.value = text;
  output.scrollTop = 0;
  outputMode.textContent = mode;
  outputMode.hidden = false;
  outputMeta.textContent = describeText(text);
  outputMeta.hidden = false;
  copyBtn.disabled = text.length === 0;
  lastOutputSource = input.value;
  resetCopyButton();
  renderGutter(output, outputGutter);
  updateStaleChip();
}

/* ---------------------------------------------------------------
   Actions
   --------------------------------------------------------------- */
function formatInput() {
  const text = input.value;
  flushInputRender();

  if (!text.trim()) {
    clearErrorState();
    setStatus("idle", "Nothing to format", "The input is empty. Paste JSON or load the example document.");
    return false;
  }

  const result = parseInput(text);

  if (!result.ok) {
    showError(result);
    return false;
  }

  clearErrorState();
  showOutput(formatJson(text), "Formatted");
  setStatus("success", "Valid JSON", "Formatted with 2-space indentation.");
  return true;
}

function minifyInput() {
  const text = input.value;
  flushInputRender();

  if (!text.trim()) {
    clearErrorState();
    setStatus("idle", "Nothing to minify", "The input is empty. Paste JSON or load the example document.");
    return false;
  }

  const result = parseInput(text);

  if (!result.ok) {
    showError(result);
    return false;
  }

  clearErrorState();
  showOutput(minifyJson(text), "Minified");
  setStatus("success", "Valid JSON", "Minified — insignificant whitespace removed.");
  return true;
}

function validateInput() {
  const text = input.value;
  flushInputRender();

  if (!text.trim()) {
    clearErrorState();
    setStatus("idle", "Nothing to validate", "The input is empty. Paste JSON or load the example document.");
    return;
  }

  const result = parseInput(text);

  if (!result.ok) {
    showError(result);
    return;
  }

  clearErrorState();
  setStatus("success", "Valid JSON", "No syntax errors found. The JSON is ready to use.");
}

function loadExample() {
  input.value = EXAMPLE_JSON;
  clearErrorState();

  if (formatInput()) {
    setStatus("success", "Example loaded", "A sample document was loaded and formatted. Edit it to explore.");
  }

  input.scrollTop = 0;
  inputGutter.scrollTop = 0;
}

function clearEditors() {
  input.value = "";
  output.value = "";
  lastOutputSource = null;

  outputMode.hidden = true;
  outputMeta.hidden = true;
  staleChip.hidden = true;
  copyBtn.disabled = true;
  resetCopyButton();

  clearErrorState();
  flushInputRender();
  renderGutter(output, outputGutter);

  setStatus("idle", "Cleared", "Both editors are empty. Paste JSON or load the example to begin.");
  input.focus();
}

async function copyOutput() {
  if (!output.value) return;

  const copied = await writeClipboard(output.value);

  if (copied) {
    showCopySuccess();
    announce("JSON copied to the clipboard.");
  } else {
    setStatus(
      "error",
      "Copy failed",
      "Your browser blocked clipboard access. Select the output and copy it manually."
    );
    announce("Copy failed. Your browser blocked clipboard access.");
  }
}

async function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }

  const previouslyFocused = document.activeElement;
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.top = "-9999px";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  helper.remove();

  if (previouslyFocused && previouslyFocused !== document.body && typeof previouslyFocused.focus === "function") {
    previouslyFocused.focus({ preventScroll: true });
  }

  return copied;
}

/* ---------------------------------------------------------------
   Events
   --------------------------------------------------------------- */
input.addEventListener("input", () => {
  clearErrorState();
  setDefaultStatus();

  if (inputFrame) return;
  inputFrame = requestAnimationFrame(() => {
    inputFrame = 0;
    updateInputMeta();
    renderGutter(input, inputGutter);
    updateStaleChip();
  });
});

input.addEventListener("scroll", () => {
  inputGutter.scrollTop = input.scrollTop;
});

output.addEventListener("scroll", () => {
  outputGutter.scrollTop = output.scrollTop;
});

window.addEventListener("resize", () => {
  inputGutter.scrollTop = input.scrollTop;
  outputGutter.scrollTop = output.scrollTop;
});

formatBtn.addEventListener("click", formatInput);
minifyBtn.addEventListener("click", minifyInput);
validateBtn.addEventListener("click", validateInput);
exampleBtn.addEventListener("click", loadExample);
clearBtn.addEventListener("click", clearEditors);
copyBtn.addEventListener("click", copyOutput);

document.addEventListener("keydown", (event) => {
  if (event.isComposing || event.altKey) return;
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    formatInput();
  }
});

/* ---------------------------------------------------------------
   Initial state
   --------------------------------------------------------------- */
const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);

if (isMac) {
  document.getElementById("formatShortcut").textContent = "⌘ ↵";
  for (const key of document.querySelectorAll(".js-mod-key")) {
    key.textContent = "⌘";
  }
}

updateInputMeta();
renderGutter(input, inputGutter);
renderGutter(output, outputGutter);
