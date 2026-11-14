import type { StatsPlatform } from '../StatsPlatform';

/** The `osName` and `osVersion` fields of a payload, in the form Java's `os.name` and `os.version` take. */
export interface BStatsOs {
    readonly osName: string;
    readonly osVersion: string;
}

/** The first Windows 11 build. Windows 11 still names itself Windows 10 in places, so the build decides. */
const WINDOWS_11_BUILD = 22_000;

/** The Darwin major version macOS 26 runs on, where macOS numbering jumped from 15 to 26. */
const DARWIN_MACOS_26 = 25;

/** A Windows edition at the start of `os.version()`, such as `Windows Server 2012 R2` or `Windows 11`. */
const WINDOWS_EDITION = /^Windows(?: Server)? \d+(?:\.\d+)?(?: R2)?/;

/**
 * The macOS version a Darwin kernel release belongs to, such as `14.5` for `23.5.0`. Darwin 20
 * to 24 are macOS 11 to 15, Darwin 25 and later are macOS 26 and later, and Darwin 19 and earlier
 * are Mac OS X 10.15 and earlier.
 */
const macOsVersion = (release: string): string => {
    const [major = Number.NaN, minor = 0] = release.split('.').map(Number);
    if (!Number.isInteger(major)) return release;
    if (major < 20) return `10.${major - 4}`;
    return `${major >= DARWIN_MACOS_26 ? major + 1 : major - 9}.${minor}`;
};

/** The `major.minor` part of a release such as `10.0.22631`, which is what Java reports on Windows. */
const majorMinor = (release: string): string => release.split('.').slice(0, 2).join('.');

/** The Windows edition Java's `os.name` names, such as `Windows 11` or `Windows Server 2022`. */
const windowsName = ({ release, version }: Pick<StatsPlatform, 'release' | 'version'>): string => {
    const edition = WINDOWS_EDITION.exec(version)?.[0];
    if (edition === undefined) return 'Windows';
    const build = Number(release.split('.')[2]);
    return edition === 'Windows 10' && build >= WINDOWS_11_BUILD ? 'Windows 11' : edition;
};

/**
 * The host's OS in the form the bStats `os` chart reads, which matches the strings Java's
 * `os.name` and `os.version` hold: `Linux` with the kernel release, `Mac OS X` with the macOS
 * version, and a Windows edition such as `Windows 11` with `10.0`. Any other OS keeps the name
 * and release `node:os` gives it, such as `FreeBSD` and `13.1-RELEASE-p9`.
 * @param platform - The host's `os.type()`, `os.release()` and `os.version()`.
 * @returns The payload's `osName` and `osVersion`.
 */
export const bstatsOs = ({ type, release, version }: Pick<StatsPlatform, 'type' | 'release' | 'version'>): BStatsOs => {
    switch (type) {
        case 'Darwin':
            return { osName: 'Mac OS X', osVersion: macOsVersion(release) };
        case 'Windows_NT':
            return { osName: windowsName({ release, version }), osVersion: majorMinor(release) };
        default:
            return { osName: type, osVersion: release };
    }
};
