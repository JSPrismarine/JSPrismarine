import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { INTENT_KINDS } from './Intent';
import * as IntentHandlers from './IntentHandlers';

const here = fileURLToPath(new URL('./handlers/', import.meta.url));

/** Handler module names under `handlers/`, excluding tests. */
const handlerModuleNames = () =>
    readdirSync(here)
        .filter((file) => file.endsWith('Handler.ts') && !file.includes('.test.'))
        .map((file) => file.slice(0, -'.ts'.length))
        .sort();

describe('input/IntentHandlers', () => {
    const exported = Object.entries(IntentHandlers);

    it('exports every handler module under its own name and nothing else', () => {
        expect(exported.map(([name]) => name).sort()).toStrictEqual(handlerModuleNames());
        for (const [name, handler] of exported) expect(handler.name, name).toBe(name);
    });

    it('covers every kind in the intent table exactly once', () => {
        const kinds = exported.map(([, handler]) => handler.Kind).sort();
        expect(kinds).toStrictEqual([...INTENT_KINDS].sort());
    });
});
