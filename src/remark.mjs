/**
 * Remark plugins for mermaid SSR.
 *
 * remarkMermaidSSR  — renders ```mermaid blocks to inline SVG at build time using
 *                     svgdom as a headless browser shim. Diagrams that fail are
 *                     left as fenced code blocks.
 *
 * mermaidTitleFix   — reads `title="..."` from mermaid code block meta and emits
 *                     a <p data-title-bottom> node below the diagram. Non-mermaid
 *                     blocks are left alone; rehypeCodeBlocks handles their titles.
 *
 * IMPORTANT: mermaid must be imported at module-evaluation time — Vite's module
 * runner closes before remark callbacks fire, making dynamic imports impossible
 * inside the plugin body.
 */

import { visit } from 'unist-util-visit';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

const _require = createRequire(import.meta.url);

function setupSvgdom() {
  let createSVGWindow;
  try { ({ createSVGWindow } = _require('svgdom')); } catch { return null; }

  const win = createSVGWindow();
  const doc = win.document;

  // svgdom creates SVG documents with no <body>; mermaid's d3 needs select("body").
  const body = doc.createElement('body');
  doc.documentElement.appendChild(body);
  Object.defineProperty(doc, 'body', { get: () => body, configurable: true });

  class CSSStyleSheet {
    constructor() { this.cssRules = []; }
    insertRule(rule) { this.cssRules.push({ cssText: rule }); }
  }

  // svgdom only implements SVG element geometry; mermaid calls this on HTML elements
  // to measure label text. Return a plausible box based on character count.
  if (win.HTMLElement) {
    win.HTMLElement.prototype.getBoundingClientRect = function () {
      const w = Math.max(50, (this.textContent || '').length * 8);
      return { width: w, height: 24, top: 0, left: 0, right: w, bottom: 24, x: 0, y: 0 };
    };
  }

  win.location = new URL('http://localhost/');
  win.crypto = webcrypto;
  win.CSSStyleSheet = CSSStyleSheet;
  win.addEventListener    = () => {};
  win.removeEventListener = () => {};
  win.dispatchEvent       = () => false;
  win.getComputedStyle    = () => new Proxy({}, { get: () => '' });
  win.MutationObserver = class { observe(){} disconnect(){} takeRecords(){ return []; } };
  win.ResizeObserver   = class { observe(){} disconnect(){} };

  globalThis.window        = win;
  globalThis.document      = doc;
  globalThis.CSSStyleSheet = CSSStyleSheet;
  for (const k of ['SVGElement', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'Event']) {
    if (win[k]) globalThis[k] = win[k];
  }

  return { win, doc };
}

const domReady = setupSvgdom();

// Import mermaid at module-evaluation time — see file header.
const _mermaidImport = domReady
  ? import('mermaid').then(m => m.default).catch(err => {
      console.warn(`[astro-mermaid-ssr] Failed to import mermaid: ${err.message}`);
      return null;
    })
  : Promise.resolve(null);

/**
 * Remark plugin factory. Options:
 *   theme         — mermaid theme (default: 'default')
 *   securityLevel — mermaid securityLevel (default: 'loose')
 */
export function remarkMermaidSSR(options = {}) {
  const {
    theme = 'default',
    securityLevel = 'loose',
  } = options;

  const mermaidReady = _mermaidImport.then(mermaid => {
    if (!mermaid) return null;
    mermaid.initialize({
      startOnLoad: false,
      theme,
      securityLevel,
      htmlLabels: false, // svgdom loses innerHTML inside <foreignObject>; use SVG text
    });
    return mermaid;
  });

  return async (tree) => {
    const nodes = [];
    visit(tree, 'code', (node) => {
      if (node.lang === 'mermaid') nodes.push(node);
    });
    if (nodes.length === 0) return;

    const mermaid = await mermaidReady;
    if (!mermaid) return;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      try {
        const id = `mermaid-ssr-${i}-${Math.random().toString(36).slice(2, 6)}`;
        let { svg } = await mermaid.render(id, node.value);

        // `style X fill:#color` directives inject `fill:color !important` on cluster
        // background rects, blocking CSS theme overrides. Strip the !important and stash
        // the color in data-fill-color so CSS can override per theme.
        // Skip rects with a class attribute — those are node rects with intentional colors.
        svg = svg.replace(
          /(<rect\b[^>]*)\bstyle="fill:(#[0-9a-fA-F]{3,6})\s*!important([^"]*)"/g,
          (match, prefix, color, rest) => {
            if (/\bclass=/.test(prefix)) return match;
            return `${prefix}data-fill-color="${color.toLowerCase()}" style="fill:${color}${rest}"`;
          }
        );

        // Multi-word edge labels: the .label group has translate(dx, dy) but the outer
        // tspan keeps x="0", placing text dx pixels left of its background rect.
        // Shift the tspan's x by -dx to re-center it on the rect.
        svg = svg.replace(
          /(<g class="label"[^>]* transform="translate\()(-?[\d.]+)(,\s*-?[\d.]+\)"><g><rect[^>]*><\/rect><text[^>]*><tspan[^>]* )x="0"/g,
          (_, pre, dxStr, mid) => {
            const dx = parseFloat(dxStr);
            if (Math.abs(dx) < 0.5) return pre + dxStr + mid + 'x="0"';
            return `${pre}${dxStr}${mid}x="${-dx}"`;
          }
        );

        const escapedSrc = node.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        node.type  = 'html';
        node.value = `<div class="mermaid" data-processed="true" data-mermaid-src="${escapedSrc}">\n${svg}\n</div>`;
        delete node.lang;
        delete node.meta;
      } catch (err) {
        console.warn(`[astro-mermaid-ssr] Diagram ${i} failed to render.\n  ${err.message.slice(0, 120)}`);
      }
    }
  };
}

/**
 * Remark plugin: reads `title="..."` from mermaid code block meta and emits a
 * <p data-title-bottom> element AFTER (below) the diagram.
 * Non-mermaid blocks are left alone -- rehypeCodeBlocks handles their titles.
 */
export function mermaidTitleFix() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid') return;
      const meta = node.meta || '';
      const titleMatch = meta.match(/title=["'](.*?)["']/);
      if (!titleMatch) return;

      const title = titleMatch[1];
      const titleNode = {
        type: 'paragraph',
        data: {
          hName: 'p',
          hProperties: { 'data-title-bottom': title },
        },
        children: [{ type: 'text', value: title }],
      };

      parent.children.splice(index + 1, 0, titleNode);
      return index + 2;
    });
  };
}
