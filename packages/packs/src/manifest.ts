import type { Diagnostic } from './diagnostics';
import type { FormatVersion } from './formatVersion';
import { parseVersion } from './formatVersion';
import { isRecord } from './isRecord';

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

/** One entry of a resource pack's `subpacks`: a folder under `subpacks/` the pack can be applied with. */
export interface ManifestSubpack {
    /** `folder_name`, the subpack's folder under `subpacks/`, which a world picks it by. */
    folderName: string;
    /** `name`, what the client shows for it. */
    name: string;
}

/** A parsed and validated `manifest.json`. */
export interface Manifest {
    formatVersion: number;
    header: ManifestHeader;
    modules: ManifestModule[];
    dependencies: ManifestDependency[];
    /**
     * `metadata.product_type`, such as `addon`, when the manifest names one. A Bedrock Dedicated
     * Server marks a resource pack whose manifest says `addon` as an addon pack when it offers it.
     */
    productType?: string;
    /** `capabilities`, such as `raytraced` or `pbr`; empty when the manifest lists none. */
    capabilities: string[];
    /** `subpacks`, in manifest order; empty when the manifest lists none. */
    subpacks: ManifestSubpack[];
}

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The `format_version` values a resource, behavior or world template manifest may have. */
const DATA_PACK_FORMAT_VERSIONS: readonly number[] = [2, 3];

/**
 * A SemVer string: one to three numeric parts, then an optional pre-release and build suffix. The
 * suffix classes exclude `+`, so the pattern matches in linear time.
 */
const SEMVER_PATTERN = /^(\d+(?:\.\d+){0,2})(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Parses a manifest version. Format 3 writes versions as SemVer strings, which may carry a
 * pre-release or build suffix such as `"1.0.0-beta+7"`; the suffix is dropped, since a
 * {@link FormatVersion} keeps only the three numeric parts. A string with no numeric core, such
 * as `"-1.0.0"`, is not a version.
 */
const parseManifestVersion = (value: unknown): FormatVersion | undefined => {
    if (typeof value !== 'string') return parseVersion(value);
    const core = SEMVER_PATTERN.exec(value)?.[1];
    return core === undefined ? undefined : parseVersion(core);
};

/**
 * Parses a decoded `manifest.json` against the documented schema: `header`
 * with `name`, `uuid` and `version`; `modules` with at least one entry, each
 * with `type`, `uuid` and `version`; optional `dependencies`; and a
 * `format_version` of 1 for skin packs and 2 or 3 otherwise. Format 3 writes
 * versions as SemVer strings instead of `[major, minor, patch]` arrays; both
 * shapes are read under either format.
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
    const headerVersion = parseManifestVersion(header.version);
    if (!headerVersion) return fail('header.version must be a version');
    const minEngineVersion =
        header.min_engine_version === undefined ? undefined : parseManifestVersion(header.min_engine_version);
    if (header.min_engine_version !== undefined && !minEngineVersion)
        return fail('header.min_engine_version must be a version');

    if (!Array.isArray(value.modules) || value.modules.length === 0)
        return fail('modules must be an array with at least one entry');
    const modules: ManifestModule[] = [];
    for (const entry of value.modules) {
        if (!isRecord(entry) || typeof entry.type !== 'string') return fail('each module needs a string type');
        if (typeof entry.uuid !== 'string' || !UUID_PATTERN.test(entry.uuid)) return fail('each module needs a UUID');
        const moduleVersion = parseManifestVersion(entry.version);
        if (!moduleVersion) return fail('each module needs a version');
        modules.push({ type: entry.type, uuid: entry.uuid, version: moduleVersion });
    }

    const isSkinPack = modules.some((module) => module.type === 'skin_pack');
    const expectedFormatVersions: readonly number[] = isSkinPack ? [1] : DATA_PACK_FORMAT_VERSIONS;
    const formatVersion = value.format_version;
    if (typeof formatVersion !== 'number' || !expectedFormatVersions.includes(formatVersion))
        return fail(
            `format_version must be ${expectedFormatVersions.join(' or ')} for a ${isSkinPack ? 'skin' : 'resource, behavior or world template'} pack, got ${JSON.stringify(formatVersion)}`
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
            const dependencyVersion = parseManifestVersion(entry.version);
            if (!dependencyVersion) return fail('each pack dependency needs a version');
            dependencies.push({ uuid: entry.uuid, version: dependencyVersion });
        }
    }

    const productType =
        isRecord(value.metadata) && typeof value.metadata.product_type === 'string'
            ? value.metadata.product_type
            : undefined;

    // Neither is validated: the client reads them, and a malformed entry only loses itself.
    const capabilities = Array.isArray(value.capabilities)
        ? value.capabilities.filter((each): each is string => typeof each === 'string')
        : [];
    const subpacks = Array.isArray(value.subpacks)
        ? value.subpacks.flatMap((entry: unknown): ManifestSubpack[] =>
              isRecord(entry) && typeof entry.folder_name === 'string' && entry.folder_name.length > 0
                  ? [
                        {
                            folderName: entry.folder_name,
                            name: typeof entry.name === 'string' ? entry.name : entry.folder_name
                        }
                    ]
                  : []
          )
        : [];

    return {
        manifest: {
            formatVersion,
            header: { name: header.name, uuid: header.uuid, version: headerVersion, minEngineVersion },
            modules,
            dependencies,
            ...(productType === undefined ? {} : { productType }),
            capabilities,
            subpacks
        },
        diagnostics
    };
};
