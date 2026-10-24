import type { Diagnostic } from './diagnostics';
import type { FormatVersion } from './formatVersion';
import { parseVersion } from './formatVersion';

/** The identity block of a pack manifest. */
export interface ManifestHeader {
    name: string;
    uuid: string;
    version: FormatVersion;
    minEngineVersion?: FormatVersion;
}

/** One module entry of a pack manifest. */
export interface ManifestModule {
    type: string;
    uuid: string;
    version: FormatVersion;
}

/** A dependency on another pack's header UUID. */
export interface ManifestDependency {
    uuid: string;
    version: FormatVersion;
}

/** A parsed and validated `manifest.json`. */
export interface Manifest {
    formatVersion: number;
    header: ManifestHeader;
    modules: ManifestModule[];
    dependencies: ManifestDependency[];
}

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Parses a decoded `manifest.json` against the documented schema: `header`
 * with `name`, `uuid` and `version`; `modules` with at least one entry, each
 * with `type`, `uuid` and `version`; optional `dependencies`; and a
 * `format_version` of 1 for skin packs and 2 otherwise.
 *
 * @param pack - The pack name used in diagnostics, usually the source path.
 * @returns The manifest when it validates, plus every finding. A result
 * without a manifest means the pack cannot load.
 */
export const parseManifest = (value: unknown, pack: string): { manifest?: Manifest; diagnostics: Diagnostic[] } => {
    const diagnostics: Diagnostic[] = [];
    const fail = (message: string): { diagnostics: Diagnostic[] } => {
        diagnostics.push({ severity: 'error', code: 'manifest.invalid', pack, path: 'manifest.json', message });
        return { diagnostics };
    };

    if (!isRecord(value)) return fail('manifest.json is not a JSON object');

    const header = isRecord(value.header) ? value.header : undefined;
    if (!header) return fail('manifest.json has no header object');
    if (typeof header.name !== 'string' || header.name.length === 0)
        return fail('header.name must be a non-empty string');
    if (typeof header.uuid !== 'string' || !UUID_PATTERN.test(header.uuid)) return fail('header.uuid must be a UUID');
    const headerVersion = parseVersion(header.version);
    if (!headerVersion) return fail('header.version must be a version');
    const minEngineVersion =
        header.min_engine_version === undefined ? undefined : parseVersion(header.min_engine_version);
    if (header.min_engine_version !== undefined && !minEngineVersion)
        return fail('header.min_engine_version must be a version');

    if (!Array.isArray(value.modules) || value.modules.length === 0)
        return fail('modules must be an array with at least one entry');
    const modules: ManifestModule[] = [];
    for (const entry of value.modules) {
        if (!isRecord(entry) || typeof entry.type !== 'string') return fail('each module needs a string type');
        if (typeof entry.uuid !== 'string' || !UUID_PATTERN.test(entry.uuid)) return fail('each module needs a UUID');
        const moduleVersion = parseVersion(entry.version);
        if (!moduleVersion) return fail('each module needs a version');
        modules.push({ type: entry.type, uuid: entry.uuid, version: moduleVersion });
    }

    const isSkinPack = modules.some((module) => module.type === 'skin_pack');
    const expectedFormatVersion = isSkinPack ? 1 : 2;
    if (value.format_version !== expectedFormatVersion)
        return fail(
            `format_version must be ${expectedFormatVersion} for a ${isSkinPack ? 'skin' : 'resource, behavior or world template'} pack, got ${JSON.stringify(value.format_version)}`
        );

    const dependencies: ManifestDependency[] = [];
    if (value.dependencies !== undefined) {
        if (!Array.isArray(value.dependencies)) return fail('dependencies must be an array');
        for (const entry of value.dependencies) {
            if (!isRecord(entry)) return fail('each dependency must be an object');
            // Native module dependencies ({module_name, version}) matter to a
            // client, not to this loader; only pack dependencies are kept.
            if (typeof entry.uuid !== 'string') continue;
            if (!UUID_PATTERN.test(entry.uuid)) return fail('each pack dependency needs a UUID');
            const dependencyVersion = parseVersion(entry.version);
            if (!dependencyVersion) return fail('each pack dependency needs a version');
            dependencies.push({ uuid: entry.uuid, version: dependencyVersion });
        }
    }

    return {
        manifest: {
            formatVersion: expectedFormatVersion,
            header: { name: header.name, uuid: header.uuid, version: headerVersion, minEngineVersion },
            modules,
            dependencies
        },
        diagnostics
    };
};
