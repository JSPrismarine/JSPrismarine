import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { JSPRISMARINE_SERVER, jsprismarineServerSource, jsprismarineServerTypings } from './jsprismarineServer';

describe('@jsprismarine/server', () => {
    const info = { version: '1.2.3', minecraftVersion: '1.26.50', protocolVersion: 2193 };

    it('evaluates to each export, with the fixed values and the ones the server supplied', () => {
        // The source is one expression of JSON values and Object.freeze, which any engine evaluates.
        const namespace: unknown = runInNewContext(jsprismarineServerSource(info));

        expect(JSON.stringify(namespace)).toBe(JSON.stringify({ jsprismarine: { name: 'JSPrismarine', ...info } }));
    });

    it('declares every member and property it defines, under the module name, with its summary', () => {
        const typings = jsprismarineServerTypings();

        expect(typings).toContain("declare module '@jsprismarine/server' {");
        for (const [name, member] of Object.entries(JSPRISMARINE_SERVER)) {
            expect(typings).toContain(`    /** ${member.summary} */\n    export const ${name}: {`);
            for (const [key, property] of Object.entries(member.properties)) {
                const type = 'value' in property ? JSON.stringify(property.value) : property.type;
                expect(typings).toContain(`        /** ${property.summary} */\n        readonly ${key}: ${type};`);
            }
        }
    });
});
