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

/** A pack as BDS's content log names it: its header name and version. */
export interface PackIdentity {
    readonly name: string;
    readonly version: string;
}

/** What a resolution needs besides the dependency. */
export interface ResolveOptions {
    readonly pack: PackIdentity;
    /** The world's `allowed_modules`, from `permissions.json`. */
    readonly allowedModules: readonly string[];
    /** Whether the world turns on the Beta APIs experiment. */
    readonly betaApis?: boolean;
    /** The module histories to resolve against. The generated ones when absent. */
    readonly histories?: Readonly<Record<string, ModuleHistory>>;
}

/**
 * Why BDS refuses a dependency. BDS creates no context for a pack refused for an unknown module
 * or version, and logs that beside the reason; the other refusals it logs alone. `alpha` is the one
 * BDS does not make: it loads an alpha API that this server has no shape for.
 */
export type ResolveFailure =
    'not-allowed' | 'unknown-module' | 'unknown-version' | 'beta-disabled' | 'internal' | 'alpha';

/** The API BDS serves for a dependency, or the content log line it refuses the pack with. */
export type Resolution =
    | { readonly ok: true; readonly requested: string; readonly shape: ModuleShape }
    | { readonly ok: false; readonly reason: ResolveFailure; readonly message: string };

/** The version tag and the version word that ask for a beta. Any other tag, such as `alpha`, does not. */
const BETA = 'beta';
/** The version tag and the version word that ask for an alpha API. */
const ALPHA = 'alpha';

/** The beta a module's history serves: its newest beta version, which BDS calls the current one. */
export const currentBeta = (history: ModuleHistory): string | undefined =>
    history.versions.filter((entry) => entry.stability === 'beta').at(-1)?.version;

/**
 * Resolves a pack's native module dependency the way the pinned BDS does
 * (section 2 of `docs/research/bedrock-script-api.md`):
 *
 * - A module the world's `allowed_modules` leaves out is refused before BDS looks it up, so an
 *   unknown module that is also not allowed gets the not-allowed message.
 * - A stable version gets the newest stable minor of its major version, so 2.0.0 gets 2.10.0 and
 *   1.3.0 gets 1.19.0.
 * - A beta version, `-beta` or the word `beta`, needs the Beta APIs experiment, which BDS checks
 *   before it checks the version. Beta versions do not follow semver: a pack gets the one beta BDS
 *   ships, and the word `beta` names it.
 * - An alpha version, `-alpha` or the word `alpha`, loads on BDS without the experiment, but no
 *   metadata describes its API, so there is nothing to bind it to. It is refused with a message of
 *   this server's that says so, where BDS would load the pack
 *   ([#3233](https://github.com/JSPrismarine/JSPrismarine/issues/3233)).
 * - Any other version is refused with the versions BDS ships. BDS's list also has a `0.1.0` and an
 *   `-alpha` version for each module, which the metadata does not describe, so this list leaves
 *   them out.
 */
export const resolveDependency = (dependency: ModuleDependency, options: ResolveOptions): Resolution => {
    const { module_name: module, version } = dependency;
    const label = `${options.pack.name} - ${options.pack.version}`;
    if (!options.allowedModules.includes(module)) {
        return {
            ok: false,
            reason: 'not-allowed',
            message: `Plugin [${label}] - requesting dependency on module [${module}] but it is not configured to use it.`
        };
    }
    const history = (options.histories ?? SCRIPT_MODULE_HISTORIES)[module];
    if (history === undefined) {
        return {
            ok: false,
            reason: 'unknown-module',
            message: `Plugin [${options.pack.name}] - module [${label}] depends on unknown module [${module} - ${version}].`
        };
    }
    if (version === 'internal') {
        return {
            ok: false,
            reason: 'internal',
            message: `Plugin [${label}] - requesting dependency on internal APIs [${module} - ${version}], but does not have permission to access them.`
        };
    }

    const parsed = parseVersion(version);
    if (version === ALPHA || parsed?.tag === ALPHA) {
        return {
            ok: false,
            reason: 'alpha',
            message:
                `Plugin [${label}] - requesting dependency on alpha APIs [${module} - ${version}], which JSPrismarine cannot serve: ` +
                `BDS ships them, but no published metadata describes their API. Depend on a stable or beta version instead.`
        };
    }
    const beta = currentBeta(history);
    const asksForBeta = version === BETA || parsed?.tag === BETA;
    const invalid = (): Resolution => {
        const available = [...Object.values(history.resolves), ...(beta === undefined ? [] : [beta])].sort(
            compareVersions
        );
        return {
            ok: false,
            reason: 'unknown-version',
            message:
                `Plugin [${options.pack.name}] - module [${label}] requested invalid version [${version}] of [${module}].\n` +
                (asksForBeta && beta !== undefined ? `\nCurrent [beta] version is [${beta}].\n` : '') +
                `\nAvailable versions:\n${available.join('\n')}`
        };
    };

    if (asksForBeta) {
        // The word names the beta BDS ships, in this message too.
        const named = version === BETA ? (beta ?? version) : version;
        if (options.betaApis !== true) {
            return {
                ok: false,
                reason: 'beta-disabled',
                message: `Plugin [${label}] - requesting dependency on beta APIs [${module} - ${named}], but the Beta APIs experiment is not enabled.`
            };
        }
        return beta === undefined || named !== beta
            ? invalid()
            : { ok: true, requested: version, shape: shapeAt(history, beta) };
    }
    if (parsed === undefined || parsed.tag !== undefined) return invalid();

    const resolved = history.resolves[String(parsed.major)];
    if (resolved === undefined || compareVersions(version, resolved) > 0) return invalid();
    return { ok: true, requested: version, shape: shapeAt(history, resolved) };
};
