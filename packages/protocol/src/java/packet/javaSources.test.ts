import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** The folder of the Java packet definitions, and the chunk packet's beside it. */
const JAVA = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Each definition, as the JSDoc right above it and the name it is exported under. */
const DEFINITION = /(\/\*\*(?:(?!\*\/)[\s\S])*?\*\/)?\s*\nexport const (\w+) = defineJavaPacket\(/g;

describe('Java packet definitions', () => {
    // A tag names the packet's codec in the pinned jar, so the `java.transcriptions` parity family
    // names every packet whose layout a new Java release changed.
    it('each name the codec of the vanilla packet whose layout they copy', () => {
        const untagged = ['packet', 'chunk'].flatMap((folder) =>
            readdirSync(join(JAVA, folder))
                .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'JavaPacket.ts')
                .flatMap((file) =>
                    [...readFileSync(join(JAVA, folder, file), 'utf8').matchAll(DEFINITION)]
                        .filter(([, doc]) => doc?.includes('@javaSource ') !== true)
                        .map(([, , name]) => `${folder}/${file}: ${name}`)
                )
        );
        expect(untagged).toEqual([]);
    });
});
