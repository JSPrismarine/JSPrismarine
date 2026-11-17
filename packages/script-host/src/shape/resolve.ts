import { SCRIPT_MODULE_HISTORIES } from '../generated/scriptModules';
import type { ModuleHistory } from './format';
import type { ModuleShape } from './history';
import { shapeAt } from './history';
import { compareVersions, parseVersion } from './version';

/** A pack's native module dependency, as its manifest writes it. */
export interface ModuleDependency {
    readonly module_name: string;
    readonly version: string;
}

/** What a resolution needs besides the dependency. */
export interface ResolveOptions {
    /** The pack as BDS's log names it: its header name, a dash and its version, such as `my pack - 1.0.0`. */
    readonly pack: string;
    /** The world's `allowed_modules`, from `permissions.json`. */
    readonly allowedModules: readonly string[];
    /** Whether the world turns on the Beta APIs experiment. */
    readonly betaApis?: boolean;
    /** The module histories to resolve against. The generated ones when absent. */
    readonly histories?: Readonly<Record<string, ModuleHistory>>;
}

/** Why BDS refuses a dependency. */
export type ResolveFailure = 'not-allowed' | 'unknown-module' | 'unknown-version' | 'beta-disabled' | 'internal';

/** The API BDS serves for a dependency, or the content log line it refuses the pack with. */
export type Resolution =
    | { readonly ok: true; readonly requested: string; readonly shape: ModuleShape }
    | { readonly ok: false; readonly reason: ResolveFailure; readonly message: string };

/**
 * Resolves a pack's native module dependency the way the pinned BDS does: to the newest stable
 * minor version of the major version it declares, so 2.0.0 gets 2.10.0 and 1.3.0 gets 1.19.0
 * (section 2 of `docs/research/bedrock-script-api.md`).
 *
 * BDS refuses a module the world's `allowed_modules` leaves out before it looks the module up, so
 * an unknown module that is also not allowed gets the not-allowed message, as the research run saw
 * for `@jsprismarine/server`. The research note records the not-allowed, unknown-module,
 * beta and internal messages; a version BDS does not ship is assumed to get the unknown-module one.
 */
export const resolveDependency = (dependency: ModuleDependency, options: ResolveOptions): Resolution => {
    const { module_name: module, version } = dependency;
    const { pack } = options;
    if (!options.allowedModules.includes(module)) {
        return {
            ok: false,
            reason: 'not-allowed',
            message: `Plugin [${pack}] - requesting dependency on module [${module}] but it is not configured to use it.`
        };
    }
    const unknown = (reason: ResolveFailure): Resolution => ({
        ok: false,
        reason,
        message: `Plugin [${pack}] - module [${pack}] depends on unknown module [${module} - ${version}].`
    });
    const history = (options.histories ?? SCRIPT_MODULE_HISTORIES)[module];
    if (history === undefined) return unknown('unknown-module');
    if (version === 'internal') {
        return {
            ok: false,
            reason: 'internal',
            message: `Plugin [${pack}] - requesting dependency on internal APIs [${module} - ${version}], but does not have permission to access them.`
        };
    }

    const parsed = parseVersion(version);
    if (parsed?.tag !== undefined || version === 'beta') {
        if (options.betaApis !== true) {
            return {
                ok: false,
                reason: 'beta-disabled',
                message: `Plugin [${pack}] - requesting dependency on beta APIs [${module} - ${version}], but the Beta APIs experiment is not enabled.`
            };
        }
        // Beta versions do not follow semver: a pack gets the one it names, when it is generated.
        const exact = history.versions.find((entry) => entry.version === version && entry.stability === 'beta');
        return exact === undefined
            ? unknown('unknown-version')
            : { ok: true, requested: version, shape: shapeAt(history, version) };
    }
    if (parsed === undefined) return unknown('unknown-version');

    const resolved = history.resolves[String(parsed.major)];
    if (resolved === undefined || compareVersions(version, resolved) > 0) return unknown('unknown-version');
    return { ok: true, requested: version, shape: shapeAt(history, resolved) };
};
