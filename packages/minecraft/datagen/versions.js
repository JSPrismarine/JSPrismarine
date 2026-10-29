/**
 * The protocol versions a generator runs for, read from the manifest's `versions` table.
 *
 * Each generator loops over these. A version's output lives in `src/generated/v<protocol>/`
 * and its cached inputs in `snapshot/v<protocol>/`, so versions never write over each other.
 * The version named by `defaultProtocolVersion` is also re-exported at the unversioned
 * `src/generated/` paths, which is what keeps existing imports working.
 *
 * `--protocol <n>` narrows a run to one declared version; naming an undeclared one is an
 * error rather than an empty run.
 */
import path from 'node:path';
import process from 'node:process';

export const versionsOf = (manifest, here, argv = process.argv) => {
    const declared = Object.entries(manifest.versions).filter(([key]) => !key.startsWith('$'));
    if (declared.length === 0) throw new Error('The manifest declares no versions.');

    if (!declared.some(([key]) => Number(key) === manifest.defaultProtocolVersion)) {
        throw new Error(
            `defaultProtocolVersion is ${manifest.defaultProtocolVersion}, which \`versions\` does not declare.`
        );
    }

    const flag = argv.indexOf('--protocol');
    const wanted = flag === -1 ? null : argv[flag + 1];
    if (flag !== -1 && (wanted === undefined || !declared.some(([key]) => key === wanted))) {
        throw new Error(
            `--protocol asks for ${wanted ?? 'nothing'}; the manifest declares ${declared.map(([key]) => key).join(', ')}.`
        );
    }

    return declared
        .filter(([key]) => wanted === null || key === wanted)
        .map(([key, config]) => ({
            protocol: Number(key),
            config,
            isDefault: Number(key) === manifest.defaultProtocolVersion,
            snapshotDir: path.join(here, 'snapshot', `v${key}`),
            outDir: path.join(here, '..', 'src', 'generated', `v${key}`)
        }));
};
