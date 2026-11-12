/**
 * The API reference documents Prismarine's published entry points. They are read from
 * `publishConfig.exports`, so the reference covers the modules a consumer can import and no
 * others.
 */
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** The source module of a published entry: `./dist/world/World.js` is `src/world/World.ts`. */
const sourceOf = (target) => target.import.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts');

export default {
    entryPoints: Object.values(manifest.publishConfig.exports)
        .filter((target) => typeof target === 'object' && target !== null)
        .map(sourceOf),
    readme: 'README.md'
};
