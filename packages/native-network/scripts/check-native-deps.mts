/**
 * Fails when a build of the native library depends on anything a bare machine of its platform
 * lacks, so no user has to install a system package to run NetherNet:
 *
 * - Linux glibc: `readelf -d` names only libc, libm and the dynamic loader, and `objdump -T`
 *   names no glibc symbol version above 2.36 (Debian 12).
 * - Linux musl: only musl's libc.
 * - macOS: `otool -L` names only libSystem and the system's libc++.
 * - Windows: `dumpbin /dependents` names only system DLLs.
 *
 *     node scripts/check-native-deps.mts <library> <platform-key>
 */
import { execFileSync } from 'node:child_process';

/** The newest glibc symbol version a Linux glibc build may need: Debian 12's. */
export const GLIBC_FLOOR = [2, 36] as const;

const run = (command: string, args: string[]): string => execFileSync(command, args, { encoding: 'utf8' });

/** Libraries every Windows install has; the C runtime is linked in, so no `VCRUNTIME` or `MSVCP`. */
const WINDOWS_SYSTEM = new Set([
    'kernel32.dll',
    'ws2_32.dll',
    'iphlpapi.dll',
    'bcrypt.dll',
    'advapi32.dll',
    'user32.dll',
    'crypt32.dll',
    'ntdll.dll',
    'secur32.dll'
]);

/**
 * The problems with one build, as sentences; none means it passes.
 * @param library - The shared library's path.
 * @param platform - Its platform key, such as `linux-x64-gnu`.
 * @returns The problems.
 */
export const dependencyProblems = (library: string, platform: string): string[] => {
    const problems: string[] = [];
    if (platform.startsWith('linux-') || platform.startsWith('android-')) {
        const needed = [...run('readelf', ['-d', library]).matchAll(/\(NEEDED\)\s+Shared library: \[([^\]]+)\]/g)].map(
            (match) => match[1]!
        );
        const allowed = platform.endsWith('-musl')
            ? (name: string) => /^libc\.musl-[a-z0-9_]+\.so\.1$/.test(name) || name === 'libc.so'
            : platform.startsWith('android-')
              ? (name: string) => ['libc.so', 'libm.so', 'libdl.so', 'liblog.so'].includes(name)
              : (name: string) =>
                    /^(libc\.so\.6|libm\.so\.6|ld-linux-[a-z0-9_-]+\.so\.\d|libpthread\.so\.0|libdl\.so\.2)$/.test(
                        name
                    );
        for (const name of needed) if (!allowed(name)) problems.push(`${library} needs ${name}`);
        if (platform.endsWith('-gnu')) {
            const versions = [...run('objdump', ['-T', library]).matchAll(/GLIBC_(\d+)\.(\d+)/g)].map((match) => [
                Number(match[1]),
                Number(match[2])
            ]);
            for (const [major, minor] of versions) {
                if (major! > GLIBC_FLOOR[0] || (major === GLIBC_FLOOR[0] && minor! > GLIBC_FLOOR[1])) {
                    problems.push(`${library} needs GLIBC_${major}.${minor}, above the ${GLIBC_FLOOR.join('.')} floor`);
                }
            }
        }
    } else if (platform.startsWith('darwin-')) {
        const lines = run('otool', ['-L', library]).split('\n').slice(1);
        for (const line of lines) {
            const name = line.trim().split(' ')[0];
            if (name === undefined || name === '') continue;
            if (name.endsWith('libjsp_native_network.dylib')) continue;
            if (!/^\/usr\/lib\/(libSystem\.B|libc\+\+\.1)\.dylib$/.test(name))
                problems.push(`${library} needs ${name}`);
        }
    } else if (platform.startsWith('win32-')) {
        const output = run('dumpbin', ['/NOLOGO', '/DEPENDENTS', library]);
        const names = [...output.matchAll(/^\s+([A-Za-z0-9_.-]+\.dll)\s*$/gim)].map((match) => match[1]!.toLowerCase());
        for (const name of names) {
            if (!WINDOWS_SYSTEM.has(name) && !name.startsWith('api-ms-win-')) problems.push(`${library} needs ${name}`);
        }
        if (names.length === 0) problems.push(`dumpbin listed no dependencies for ${library}`);
    } else {
        problems.push(`No dependency rule for ${platform}`);
    }
    return [...new Set(problems)];
};

if (import.meta.main) {
    const [library, platform] = process.argv.slice(2);
    if (library === undefined || platform === undefined) {
        throw new Error('Usage: node scripts/check-native-deps.mts <library> <platform-key>');
    }
    const problems = dependencyProblems(library, platform);
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) process.exit(1);
    console.log(`${library} depends only on what every ${platform} machine has`);
}
