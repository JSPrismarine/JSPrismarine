---
'@jsprismarine/server': patch
---

`pnpm start` runs the compiled server without building it first. Run `pnpm run build` or `pnpm run server:build` beforehand; a missing `dist/Server.js` fails with Node's module-not-found error.
