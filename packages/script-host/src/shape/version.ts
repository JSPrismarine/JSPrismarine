import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

/** A script module version: `major.minor.patch` and an optional prerelease tag such as `beta`. */
export interface ModuleVersionNumber {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
    readonly tag?: string;
}

const VERSION_PATTERN = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<tag>[0-9A-Za-z.-]+))?$/;

/** Reads a version string, or returns undefined for anything that is not `major.minor.patch[-tag]`. */
export const parseVersion = (version: string): ModuleVersionNumber | undefined => {
    const groups = VERSION_PATTERN.exec(version)?.groups;
    if (groups === undefined) return undefined;
    return {
        major: Number(groups.major),
        minor: Number(groups.minor),
        patch: Number(groups.patch),
        ...(groups.tag === undefined ? {} : { tag: groups.tag })
    };
};

/**
 * Orders two versions: negative when `left` comes first. A prerelease comes before its release.
 * @throws {RangeError} When either is not a version.
 */
export const compareVersions = (left: string, right: string): number => {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (a === undefined || b === undefined) throw new ScriptHostErrors.VersionsNotComparable({ left, right });
    const difference = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
    if (difference !== 0) return difference;
    if (a.tag === b.tag) return 0;
    if (a.tag === undefined) return 1;
    if (b.tag === undefined) return -1;
    return a.tag < b.tag ? -1 : 1;
};
