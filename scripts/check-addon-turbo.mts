/**
 * Checks that every addon caches the scripts its build compiles and typechecks after its
 * dependencies. Turbo reads package configurations from each addon's folder, so a root-only
 * `outputs` glob misses them. An addon's typecheck reads the declarations that
 * `@jsprismarine/script-types`' own typecheck writes, so it has to wait for `^typecheck`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRecord } from './isRecord.mts';

const ADDONS = 'addons';

/** The folder the addon compiles its scripts into, read from its tsconfig's `outDir`. */
const outDirOf = (folder: string): string => {
    const config = path.join(folder, 'tsconfig.json');
    if (!existsSync(config)) return 'scripts';
    const outDir = /"outDir"\s*:\s*"([^"]+)"/.exec(readFileSync(config, 'utf8'))?.[1] ?? 'scripts';
    return outDir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
};

/** Whether a Turbo package configuration caches an addon's compiled scripts and orders its typecheck. */
export const cachesAddonScripts = (config: unknown, outDir: string): boolean => {
    if (!isRecord(config) || !Array.isArray(config.extends) || !config.extends.includes('//')) return false;
    if (!isRecord(config.tasks) || !isRecord(config.tasks.build)) return false;
    const { outputs } = config.tasks.build;
    if (!Array.isArray(outputs) || !outputs.includes(`${outDir}/**`)) return false;
    if (!isRecord(config.tasks.typecheck)) return false;
    const { dependsOn } = config.tasks.typecheck;
    return Array.isArray(dependsOn) && dependsOn.includes('^typecheck');
};

/** The addons under `root` whose build outputs Turbo does not cache. */
export const findUncachedAddons = (root: string): string[] => {
    const folder = path.join(root, ADDONS);
    if (!existsSync(folder)) return [];
    return readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
            const addon = path.join(folder, entry.name);
            const manifest = path.join(addon, 'package.json');
            if (!existsSync(manifest)) return [];
            const pkg: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
            if (!isRecord(pkg) || !isRecord(pkg.scripts) || typeof pkg.scripts.build !== 'string') return [];

            const configFile = path.join(addon, 'turbo.json');
            const config: unknown = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : undefined;
            return cachesAddonScripts(config, outDirOf(addon)) ? [] : [path.posix.join(ADDONS, entry.name)];
        })
        .sort();
};

if (import.meta.main) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const missing = findUncachedAddons(root);
    if (missing.length > 0) {
        console.error(
            'Give each addon a turbo.json that extends "//", lists its compiled scripts in tasks.build.outputs and has tasks.typecheck depend on "^typecheck":'
        );
        for (const addon of missing) console.error(`  ${addon}`);
        process.exitCode = 1;
    } else console.log('Every addon caches its compiled scripts and orders its typecheck in Turbo.');
}
