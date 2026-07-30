/**
 * astro-mermaid-ssr
 *
 * Astro integration + remark plugins for server-side mermaid diagram rendering.
 * No client-side JavaScript required — diagrams are pre-rendered to SVG at build time.
 *
 * Usage (astro.config.ts):
 *
 *   import mermaidSSR from 'astro-mermaid-ssr';
 *   export default defineConfig({
 *     integrations: [mermaidSSR()],
 *   });
 *
 * Options:
 *   titleFix     {boolean}  — Include the title="..." remark plugin (default: true)
 *   injectCSS    {boolean}  — Auto-inject default styles (default: true)
 *   theme        {string}   — Mermaid theme, e.g. 'default', 'dark', 'neutral' (default: 'default')
 *   securityLevel {string}  — Mermaid securityLevel (default: 'loose')
 *
 * If injectCSS is false, import the styles yourself:
 *   import 'astro-mermaid-ssr/styles.css';
 *
 * To use the remark plugins directly without the integration:
 *   import { remarkMermaidSSR, mermaidTitleFix } from 'astro-mermaid-ssr';
 */

import { fileURLToPath } from 'node:url';
import { remarkMermaidSSR, mermaidTitleFix } from './src/remark.mjs';

export { remarkMermaidSSR, mermaidTitleFix };

const STYLES_PATH = fileURLToPath(new URL('./src/styles.css', import.meta.url));

export default function astroMermaidSSR(opts = {}) {
  const {
    titleFix = true,
    injectCSS = true,
    theme = 'default',
    securityLevel = 'loose',
  } = opts;

  return {
    name: 'astro-mermaid-ssr',
    hooks: {
      'astro:config:setup': ({ updateConfig, injectScript }) => {
        updateConfig({
          markdown: {
            remarkPlugins: [
              ...(titleFix ? [mermaidTitleFix] : []),
              [remarkMermaidSSR, { theme, securityLevel }],
            ],
          },
          vite: {
            ssr: {
              // svgdom and mermaid are Node-only packages; they must not be bundled
              // into the client-side Vite output.
              external: ['svgdom', 'mermaid'],
            },
          },
        });

        if (injectCSS) {
          injectScript('page-ssr', `import ${JSON.stringify(STYLES_PATH)}`);
        }
      },
    },
  };
}
