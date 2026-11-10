import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Extracts the given entry patterns from a zip archive into a directory. */
export type Unzip = (archive: string, patterns: readonly string[], destination: string) => void;

const unzipWithCli: Unzip = (archive, patterns, destination) => {
    execFileSync('unzip', ['-o', '-q', archive, ...patterns, '-d', destination]);
};

/**
 * Unpacks the server classes and bundled libraries from the bundler jar, the documented layout
 * since 1.18: the real server jar sits at `META-INF/versions/<version>/` and its dependencies
 * under `META-INF/libraries/`. The libraries are then copied flat into `<cacheDir>/libraries`.
 *
 * `ensure:java-server` extracts only the inner server jar into the same directory, so the unzip is
 * skipped only when both the server jar and the libraries are already there.
 *
 * @param jarPath - The downloaded bundler jar.
 * @param cacheDir - The per-version cache directory to extract into.
 * @param version - The Java Edition version the jar ships.
 * @param unzip - Extracts entries from the jar; defaults to the `unzip` command.
 * @returns The inner server jar and the directory holding its libraries.
 */
export const extractServer = (
    jarPath: string,
    cacheDir: string,
    version: string,
    unzip: Unzip = unzipWithCli
): { serverJar: string; librariesDir: string } => {
    const extractedDir = path.join(cacheDir, 'extracted');
    const serverJar = path.join(extractedDir, 'META-INF/versions', version, `server-${version}.jar`);
    const extractedLibrariesDir = path.join(extractedDir, 'META-INF/libraries');
    if (!fs.existsSync(serverJar) || !fs.existsSync(extractedLibrariesDir)) {
        unzip(jarPath, ['META-INF/versions/*', 'META-INF/libraries/*'], extractedDir);
    }

    const librariesDir = path.join(cacheDir, 'libraries');
    fs.mkdirSync(librariesDir, { recursive: true });
    const copyJars = (directory: string): void => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) copyJars(entryPath);
            else if (entry.name.endsWith('.jar')) fs.copyFileSync(entryPath, path.join(librariesDir, entry.name));
        }
    };
    copyJars(extractedLibrariesDir);

    return { serverJar, librariesDir };
};
