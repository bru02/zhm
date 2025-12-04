import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'
import remarkGfm from 'remark-gfm'
import rehypePrettyCode from 'rehype-pretty-code'
import rehypeMermaid from 'rehype-mermaid'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    mdx({
      remarkPlugins: [remarkGfm],
      rehypePlugins: [
        [
          rehypeMermaid,
          {
            strategy: "pre-mermaid",
          },
        ],
        [
          rehypePrettyCode,
          {
            theme: "github-light",
          },
        ],
      ],
    }),
  ],
  assetsInclude: ["**/*.xml", "**/*.csv"],
})
