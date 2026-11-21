---
'@jsprismarine/addon-tools': patch
'@jsprismarine/errors': patch
---

`jsp-addon build` compiles TypeScript addons. An addon with a `tsconfig.json` is compiled with `tsc-ts` before the build reads it, a compiler error fails the build with `AddonCompileFailed`, and the pack leaves out `package.json`, `tsconfig.json`, `src/`, `node_modules/` and the source maps. `compileAddon` from `@jsprismarine/addon-tools/compile` and `compileAddons` from `@jsprismarine/addon-tools/build` run the step on their own.
