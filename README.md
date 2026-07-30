# astro-mermaid-renderer-cli-smol

Astro integration that renders ` ```mermaid ` code blocks to inline SVG at build time. No client-side JavaScript is shipped to the browser.

Rendering happens via [svgdom](https://github.com/svgdotjs/svgdom), a headless DOM shim that convinces mermaid it is running in a browser. It is not running in a browser.

## Installation

```
npm install astro-mermaid-renderer-cli-smol mermaid svgdom
```

`mermaid` and `svgdom` are peer dependencies — install them alongside this package.

## Usage

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import mermaidSSR from 'astro-mermaid-renderer-cli-smol';

export default defineConfig({
  integrations: [mermaidSSR()],
});
```

Mermaid code blocks in your Markdown and MDX files will be replaced with pre-rendered SVG wrapped in a `<div class="mermaid">` at build time. Blocks that fail to render are left as fenced code blocks.

## Options

```ts
mermaidSSR({
  theme: 'default',       // mermaid theme — 'default', 'dark', 'neutral', 'forest'
  securityLevel: 'loose', // mermaid securityLevel
  titleFix: true,         // parse title="..." from code block meta as a caption
  injectCSS: true,        // inject the bundled stylesheet automatically
})
```

### Diagram titles

With `titleFix` enabled, you can add a caption to any code block via its meta string:

````
```mermaid title="Authentication flow"
...
```
````

Captions on mermaid blocks appear below the diagram; captions on other code blocks appear above.

## Styles

The integration injects a default stylesheet that covers light mode and dark mode. Dark mode is driven by a `.dark` class on an ancestor element (the Tailwind `darkMode: 'class'` convention).

To use your own styles instead, set `injectCSS: false` and import the bundled CSS as a starting point:

```css
@import 'astro-mermaid-renderer-cli-smol/styles.css';
```

### Custom cluster fill colors

Mermaid's `style X fill:#color` directive injects `!important` inline styles that block CSS overrides. This integration strips the `!important` from cluster background rects and stores the original color in a `data-fill-color` attribute. The default stylesheet handles `#999` and `#944`. For other colors, add rules of the form:

```css
.cluster > rect[data-fill-color="#abc"] { fill: your-color !important; }
.dark .cluster > rect[data-fill-color="#abc"] { fill: your-dark-color !important; }
```

## Using the remark plugins directly

If you prefer to wire up the remark plugins yourself:

```ts
import { remarkMermaidSSR, mermaidTitleFix } from 'astro-mermaid-renderer-cli-smol';

export default defineConfig({
  markdown: {
    remarkPlugins: [
      mermaidTitleFix,
      [remarkMermaidSSR, { theme: 'default' }],
    ],
  },
  vite: {
    ssr: { external: ['svgdom', 'mermaid'] },
  },
});
```

`svgdom` and `mermaid` must be listed in `vite.ssr.external` — they are Node-only packages and cannot be bundled into client output.
