#!/usr/bin/env node

"use strict";

const ESC = "\x1b[";
const CSI = (s) => ESC + s;
const hideCursor = () => process.stdout.write(CSI("?25l"));
const showCursor = () => process.stdout.write(CSI("?25h"));
const enterAlt = () => process.stdout.write(CSI("?1049h"));
const leaveAlt = () => process.stdout.write(CSI("?1049l"));
const reset = () => process.stdout.write(CSI("0m"));
const home = () => process.stdout.write(CSI("H"));
const clear = () => process.stdout.write(CSI("2J"));

const setFG = (r, g, b) => CSI(`38;2;${r};${g};${b}m`);
const setBG = (r, g, b) => CSI(`48;2;${r};${g};${b}m`);

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpRGB = (c1, c2, t) => [
  Math.round(lerp(c1[0], c2[0], t)),
  Math.round(lerp(c1[1], c2[1], t)),
  Math.round(lerp(c1[2], c2[2], t)),
];
const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const heartF = (x, y) => {
  const x2 = x * x,
    y2 = y * y;
  return Math.pow(x2 + y2 - 1, 3) - x2 * y * y2;
};

const messageSingle = "happy birthday";
const messageSplit = ["happy", "birthday"];

let paused = false;
let t = 0;
const fps = 28;
const omega = 2 * Math.PI * 0.9; // pulse speed

function dims() {
  const termCols = Math.max(40, process.stdout.columns || 80);
  const termRows = Math.max(20, process.stdout.rows || 24);

  const maxCols = Math.min(80, termCols);
  const maxRows = Math.min(30, termRows);

  const minColsForPhrase = Math.min(
    maxCols,
    Math.max(messageSingle.length + 4, 48),
  );
  const cols = Math.min(maxCols, Math.max(48, minColsForPhrase));
  const rows = Math.min(maxRows, Math.max(24, Math.floor(maxCols * 0.4)));

  const leftPad = Math.max(0, Math.floor((termCols - cols) / 2));
  const topPad = Math.max(0, Math.floor((termRows - rows) / 2));
  return { termCols, termRows, cols, rows, leftPad, topPad };
}

function draw() {
  const { cols, rows, leftPad, topPad } = dims();
  const xSpan = 1.6;
  const ySpan = 1.25; // vertical squash to counter char aspect

  const pulse = 1 + 0.06 * Math.sin((t / fps) * omega);

  const cTop = [255, 45, 85]; // cherry
  const cBot = [255, 142, 163]; // soft pink

  const shinePhase = (t / fps) * 0.7; // slow drift

  const pickTextRows =
    cols >= messageSingle.length + 4
      ? [Math.floor(rows * 0.52)]
      : [Math.floor(rows * 0.46), Math.floor(rows * 0.6)];

  const insideRowSegments = {};
  for (const rr of pickTextRows) {
    let best = { start: 0, end: -1, len: 0 };
    let curStart = -1;
    for (let c = 0; c < cols; c++) {
      const x0 = ((c - cols / 2 + 0.5) / (cols / 2)) * xSpan;
      const y0 = -((rr - rows / 2 + 0.5) / (rows / 2)) * ySpan;
      const x = x0 / pulse;
      const y = y0 / (pulse * 0.95);
      const inside = heartF(x, y) <= 0;
      if (inside) {
        if (curStart < 0) curStart = c;
      } else {
        if (curStart >= 0) {
          const len = c - curStart;
          if (len > best.len) best = { start: curStart, end: c - 1, len };
          curStart = -1;
        }
      }
    }
    if (curStart >= 0) {
      const len = cols - curStart;
      if (len > best.len) best = { start: curStart, end: cols - 1, len };
    }
    insideRowSegments[rr] = best;
  }

  let out = "";
  out += CSI("H"); // cursor home
  for (let i = 0; i < topPad; i++) out += "\n";

  for (let r = 0; r < rows; r++) {
    // left padding
    out += " ".repeat(leftPad);

    const isTextRowIdx = pickTextRows.indexOf(r);
    const textForRow =
      isTextRowIdx >= 0
        ? pickTextRows.length === 1
          ? messageSingle
          : messageSplit[isTextRowIdx]
        : null;

    let textStart = -1;
    if (textForRow) {
      const seg = insideRowSegments[r];
      if (seg.len >= textForRow.length + 2) {
        textStart = Math.floor(seg.start + (seg.len - textForRow.length) / 2);
      } else if (cols >= textForRow.length + 2) {
        textStart = Math.floor((cols - textForRow.length) / 2);
      }
    }

    for (let c = 0; c < cols; c++) {
      const x0 = ((c - cols / 2 + 0.5) / (cols / 2)) * xSpan;
      const y0 = -((r - rows / 2 + 0.5) / (rows / 2)) * ySpan;

      const x = x0 / pulse;
      const y = y0 / (pulse * 0.95);

      const f = heartF(x, y);
      const inside = f <= 0;

      if (inside) {
        // vertical gradient
        const gv = clamp((y + ySpan) / (2 * ySpan));
        let [rC, gC, bC] = lerpRGB(cTop, cBot, gv);

        const edge = clamp(0.6 - Math.abs(f) * 3, 0, 0.6); // stronger near boundary
        rC = clamp(rC + Math.round(80 * edge), 0, 255);
        gC = clamp(gC + Math.round(60 * edge), 0, 255);
        bC = clamp(bC + Math.round(60 * edge), 0, 255);

        const band = Math.sin((x + y) * 2 + shinePhase) * 0.5 + 0.5;
        const shine = Math.pow(clamp(band - 0.35, 0, 1), 1.8);
        rC = clamp(rC + Math.round(70 * shine), 0, 255);
        gC = clamp(gC + Math.round(40 * shine), 0, 255);
        bC = clamp(bC + Math.round(40 * shine), 0, 255);

        const bg = setBG(rC, gC, bC);

        if (
          textForRow &&
          textStart >= 0 &&
          c >= textStart &&
          c < textStart + textForRow.length
        ) {
          const ch = textForRow[c - textStart];
          const lum = luminance(rC, gC, bC);
          const [fr, fg, fb] = lum > 155 ? [20, 20, 20] : [255, 255, 255];
          out += bg + setFG(fr, fg, fb) + ch;
        } else {
          out += bg + " ";
        }
      } else {
        out += CSI("0m") + " ";
      }
    }
    out += CSI("0m") + "\n";
  }

  process.stdout.write(out);
  t++;
}

function cleanup() {
  reset();
  showCursor();
  leaveAlt();
}

function init() {
  enterAlt();
  hideCursor();
  clear();
  home();

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (data) => {
      if (data === "\u0003" || data.toLowerCase() === "q") {
        // Ctrl+C or q
        process.exit(0);
      } else if (data === " " || data === "\r") {
        paused = !paused;
      }
    });
  }

  process.on("SIGINT", () => process.exit(0));
  process.on("exit", cleanup);
  process.on("uncaughtException", (e) => {
    cleanup();
    console.error(e);
    process.exit(1);
  });

  let lastW = process.stdout.columns,
    lastH = process.stdout.rows;
  const timer = setInterval(
    () => {
      if (!paused) draw();
      if (process.stdout.columns !== lastW || process.stdout.rows !== lastH) {
        lastW = process.stdout.columns;
        lastH = process.stdout.rows;
        draw();
      }
    },
    Math.round(1000 / fps),
  );
}

init();
