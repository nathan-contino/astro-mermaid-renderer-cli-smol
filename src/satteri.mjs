/**
 * Sätteri mdast plugins for mermaid SSR. Same output as the unified
 * `remarkMermaidSSR` and `mermaidTitleFix`; rendering lives in core.mjs.
 *
 *   import { satteri } from '@astrojs/markdown-satteri';
 *   import { mermaidTitle, mermaidSSR } from 'astro-better-mermaid/satteri';
 *
 *   satteri({ mdastPlugins: [mermaidTitle(), mermaidSSR()] });
 *
 * Put mermaidTitle first, as with the unified plugins.
 */

import { createRenderer, titleNode } from './core.mjs';

/**
 * Render ```mermaid blocks to inline SVG. Options match remarkMermaidSSR:
 * theme, securityLevel, cache, cacheDir.
 */
export function mermaidSSR(options = {}) {
  const render = createRenderer(options);

  // a factory runs once per document, which gives each document its own diagram index
  return () => {
    let index = 0;
    return {
      name: 'astro-better-mermaid:ssr',
      async code(node, ctx) {
        if (node.lang !== 'mermaid') return;
        const html = await render(node.value, index++);
        if (!html) return;
        // MDX can't hold html nodes, so parse into JSX there; the SVG's CSS braces stay literal
        return ctx.sourceFormat === 'mdx' ? { raw: html, mdxExpressions: false } : { type: 'html', value: html };
      },
    };
  };
}

/** Emit a <p data-title-bottom> below mermaid blocks that have title="..." meta. */
export function mermaidTitle() {
  return {
    name: 'astro-better-mermaid:title',
    code(node, ctx) {
      if (node.lang !== 'mermaid') return;
      const title = titleNode(node.meta);
      if (title) ctx.insertAfter(node, title);
    },
  };
}
