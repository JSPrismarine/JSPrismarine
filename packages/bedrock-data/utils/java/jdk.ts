/**
 * Finds a local JDK for the pipeline steps that compile or run Mojang's Java Edition tooling.
 *
 * The pinned server jar records the Java feature release it was built for in its `version.json`,
 * so callers pass that number instead of repeating it here.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Points the Java steps at one JDK, ahead of `JAVA_HOME` and anything macOS has registered. */
export const JDK_HOME_ENV = 'JSP_JAVA_HOME';

/** What a pipeline step needs out of a JDK. */
export interface JdkRequirement {
    /** Lowest acceptable feature release, such as 25 for the Java Edition 26.3 server jar. */
    readonly minimumMajor: number;
    /**
     * Highest acceptable feature release. A launcher that matches the game's Java exactly, as
     * HeadlessMC does, needs the same release the game names. Defaults to no limit.
     */
    readonly maximumMajor?: number;
    /** Executables that must exist under the JDK's `bin/`. Defaults to `java` alone. */
    readonly binaries?: readonly string[];
}

/**
 * Where a JDK search looks: the environment variables and the platform, the process's own unless
 * a caller passes others. A test passes its own rather than changing the process's, which test
 * files running beside it on other threads read too.
 */
export interface JdkSearchContext {
    /** The environment `JSP_JAVA_HOME`, `JAVA_HOME` and `PATH` are read from. */
    readonly env?: Readonly<Record<string, string | undefined>>;
    /** The platform, which decides the executable names and the `PATH` separator. */
    readonly platform?: NodeJS.Platform;
    /** Runs `java --version` and returns what it wrote; a candidate whose run throws is skipped. */
    readonly versionOf?: (javaBinary: string) => string;
}

/** Runs a JDK's `java --version`. */
const runVersion = (javaBinary: string): string => execFileSync(javaBinary, ['--version'], { encoding: 'utf8' });

/** Resolves a tool name to its executable under a JDK's `bin/` directory. */
export const jdkBinaryPath = (home: string, binary: string, platform: NodeJS.Platform = process.platform): string => {
    const executable = platform === 'win32' && !binary.toLowerCase().endsWith('.exe') ? `${binary}.exe` : binary;
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
export const pathJavaHome = ({ env = process.env, platform = process.platform }: JdkSearchContext = {}):
    string | undefined => {
    const binary = platform === 'win32' ? 'java.exe' : 'java';
    for (const entry of (env['PATH'] ?? '').split(platform === 'win32' ? ';' : ':')) {
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
const candidateHomes = (
    minimumMajor: number,
    maximumMajor: number | undefined,
    context: JdkSearchContext
): string[] => {
    const { env = process.env, platform = process.platform } = context;
    const homes: string[] = [];
    for (const variable of [JDK_HOME_ENV, 'JAVA_HOME']) {
        const home = env[variable];
        if (home !== undefined && home !== '') homes.push(home);
    }

    if (platform === 'darwin') {
        try {
            const range = maximumMajor === minimumMajor ? `${minimumMajor}` : `${minimumMajor}+`;
            const home = execFileSync('/usr/libexec/java_home', ['-v', range], {
                encoding: 'utf8'
            }).trim();
            if (home) homes.push(home);
        } catch {
            // No registered JVM matches; the error below says what to install.
        }
    }

    const onPath = pathJavaHome(context);
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
const featureRelease = (javaBinary: string, versionOf: (javaBinary: string) => string): number => {
    try {
        const banner = versionOf(javaBinary);
        return Number(/\b(\d+)/.exec(banner.split('\n')[0] ?? '')?.[1] ?? 0);
    } catch {
        return 0;
    }
};

/**
 * Returns the home directory of a JDK that meets the requirement.
 *
 * @param context - Where to look, the process's environment and platform by default.
 * @throws Error naming {@link JDK_HOME_ENV} when no candidate qualifies.
 */
export const findJdkHome = (requirement: JdkRequirement, context: JdkSearchContext = {}): string => {
    const platform = context.platform ?? process.platform;
    const binaries = requirement.binaries ?? ['java'];
    const { minimumMajor, maximumMajor = Number.POSITIVE_INFINITY } = requirement;
    for (const home of candidateHomes(minimumMajor, requirement.maximumMajor, context)) {
        if (!binaries.every((binary) => existsSync(jdkBinaryPath(home, binary, platform)))) continue;
        const major = featureRelease(jdkBinaryPath(home, 'java', platform), context.versionOf ?? runVersion);
        if (major >= minimumMajor && major <= maximumMajor) return home;
    }

    const wanted = maximumMajor === minimumMajor ? `${minimumMajor}` : `${minimumMajor} or newer`;
    throw new Error(
        `No JDK ${wanted} providing ${binaries.join(' and ')} was found. ` +
            `Install one (Temurin, for example) or set ${JDK_HOME_ENV} to a suitable JDK's home directory.`
    );
};
