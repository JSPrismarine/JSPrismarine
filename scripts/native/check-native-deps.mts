/**
 * Fails when a build of a native library depends on anything a bare machine of its platform
 * lacks, so no user has to install a system package to run it:
 *
 * - Linux glibc: `readelf -d` names only libc, libm and the dynamic loader, and `objdump -T`
 *   names no glibc symbol version above 2.36 (Debian 12).
 * - Linux musl: only musl's libc.
 * - macOS: `otool -L` names only libSystem and the system's libc++.
 * - Windows: `dumpbin /dependents`, or `objdump -p` from MinGW-w64, names only system DLLs.
 *
 *     node scripts/native/check-native-deps.mts <library> <platform-key>
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { basename } from 'node:path';

/** The newest glibc symbol version a Linux glibc build may need: Debian 12's. */
export const GLIBC_FLOOR = [2, 36] as const;

const run = (command: string, args: string[]): string => execFileSync(command, args, { encoding: 'utf8' });

/**
 * Libraries every Windows install has, beside the `api-ms-win-` API sets. An MSVC build links its C
 * runtime in, so no `VCRUNTIME` or `MSVCP`; a MinGW-w64 build links libgcc and winpthreads in and
 * calls the Universal C Runtime through the `api-ms-win-crt-` API sets.
 */
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
            if (basename(name) === basename(library)) continue;
            if (!/^\/usr\/lib\/(libSystem\.B|libc\+\+\.1)\.dylib$/.test(name))
                problems.push(`${library} needs ${name}`);
        }
    } else if (platform.startsWith('win32-')) {
        // MSVC's dumpbin where the job set up MSVC, otherwise MinGW-w64's objdump.
        const matches =
            spawnSync('dumpbin', ['/NOLOGO'], { stdio: 'ignore' }).error === undefined
                ? [...run('dumpbin', ['/NOLOGO', '/DEPENDENTS', library]).matchAll(/^\s+([A-Za-z0-9_.-]+\.dll)\s*$/gim)]
                : [...run('objdump', ['-p', library]).matchAll(/^\s*DLL Name:\s*(\S+\.dll)\s*$/gim)];
        const names = matches.map((match) => match[1]!.toLowerCase());
        for (const name of names) {
            if (!WINDOWS_SYSTEM.has(name) && !name.startsWith('api-ms-win-')) problems.push(`${library} needs ${name}`);
        }
        if (names.length === 0) problems.push(`The import table of ${library} names no DLL`);
    } else {
        problems.push(`No dependency rule for ${platform}`);
    }
    return [...new Set(problems)];
};

if (import.meta.main) {
    const [library, platform] = process.argv.slice(2);
    if (library === undefined || platform === undefined) {
        throw new Error('Usage: node scripts/native/check-native-deps.mts <library> <platform-key>');
    }
    const problems = dependencyProblems(library, platform);
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) process.exit(1);
    console.log(`${library} depends only on what every ${platform} machine has`);
}
