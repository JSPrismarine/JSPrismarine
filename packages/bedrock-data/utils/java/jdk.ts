/**
 * Finds a local JDK for the pipeline steps that compile or run Mojang's Java Edition tooling.
 *
 * The pinned server jar records the Java feature release it was built for in its `version.json`,
 * so callers pass that number instead of repeating it here.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

/** Points the Java steps at one JDK, ahead of `JAVA_HOME` and anything macOS has registered. */
export const JDK_HOME_ENV = 'JSP_JAVA_HOME';

/** What a pipeline step needs out of a JDK. */
export interface JdkRequirement {
    /** Lowest acceptable feature release, such as 25 for the Java Edition 26.3 server jar. */
    readonly minimumMajor: number;
    /** Executables that must exist under the JDK's `bin/`. Defaults to `java` alone. */
    readonly binaries?: readonly string[];
}

/** Resolves a tool name to its executable under a JDK's `bin/` directory. */
export const jdkBinaryPath = (home: string, binary: string): string => {
    const executable =
        process.platform === 'win32' && !binary.toLowerCase().endsWith('.exe') ? `${binary}.exe` : binary;
    return join(home, 'bin', executable);
};

/**
 * The JDK that owns the `java` on `PATH`.
 *
 * Most Linux installs, and anything managed by a version switcher such as SDKMAN or mise, put
 * `java` on `PATH` without setting `JAVA_HOME`. `PATH` is walked here rather than shelled out
 * to, so the lookup behaves the same on every platform. The symlink is resolved first, because
 * a distribution's `/usr/bin/java` usually points into the real home.
 */
export const pathJavaHome = (): string | undefined => {
    const binary = process.platform === 'win32' ? 'java.exe' : 'java';
    for (const entry of (process.env['PATH'] ?? '').split(delimiter)) {
        if (entry === '') continue;

        const candidate = join(entry, binary);
        if (!existsSync(candidate)) continue;

        try {
            return dirname(dirname(realpathSync(candidate)));
        } catch {
            // An unreadable symlink is no worse than no candidate at all.
        }
    }

    return undefined;
};

/** Homes to try, in order: the two environment variables, the macOS registry, then `PATH`. */
const candidateHomes = (minimumMajor: number): string[] => {
    const homes: string[] = [];
    for (const variable of [JDK_HOME_ENV, 'JAVA_HOME']) {
        const home = process.env[variable];
        if (home !== undefined && home !== '') homes.push(home);
    }

    if (process.platform === 'darwin') {
        try {
            const home = execFileSync('/usr/libexec/java_home', ['-v', `${minimumMajor}+`], {
                encoding: 'utf8'
            }).trim();
            if (home) homes.push(home);
        } catch {
            // No registered JVM matches; the error below says what to install.
        }
    }

    const onPath = pathJavaHome();
    if (onPath !== undefined) homes.push(onPath);

    return homes;
};

/**
 * Reads a JDK's feature release.
 *
 * `java --version` writes `openjdk 27 2026-09-15` to stdout, while the older `java -version`
 * writes its banner to stderr and leaves stdout empty.
 *
 * @returns The leading number of the banner, or 0 when the binary does not run or says nothing
 *   recognizable.
 */
const featureRelease = (javaBinary: string): number => {
    try {
        const banner = execFileSync(javaBinary, ['--version'], { encoding: 'utf8' });
        return Number(/\b(\d+)/.exec(banner.split('\n')[0] ?? '')?.[1] ?? 0);
    } catch {
        return 0;
    }
};

/**
 * Returns the home directory of a JDK that meets the requirement.
 *
 * @throws Error naming {@link JDK_HOME_ENV} when no candidate qualifies.
 */
export const findJdkHome = (requirement: JdkRequirement): string => {
    const binaries = requirement.binaries ?? ['java'];
    for (const home of candidateHomes(requirement.minimumMajor)) {
        if (!binaries.every((binary) => existsSync(jdkBinaryPath(home, binary)))) continue;
        if (featureRelease(jdkBinaryPath(home, 'java')) >= requirement.minimumMajor) return home;
    }

    throw new Error(
        `No JDK ${requirement.minimumMajor} or newer providing ${binaries.join(' and ')} was found. ` +
            `Install one (Temurin, for example) or set ${JDK_HOME_ENV} to a suitable JDK's home directory.`
    );
};
