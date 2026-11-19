import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptEngine } from './ScriptEngine';
import { engineFunctionSource } from './engineSource';
import { loadLibrary, scriptHostAvailable } from './testing/library.test-utils';

describe.skipIf(!scriptHostAvailable())('engineFunctionSource', () => {
    let engine: ScriptEngine;
    beforeAll(() => {
        engine = loadLibrary().createEngine();
    });
    afterAll(() => engine.destroy());

    it('runs a function whose text a keepNames transform wrapped in __name calls', () => {
        // What esbuild's keepNames, which tsx uses, makes of a function with a named inner arrow.
        const transformed =
            'function outer() { const inner = /* @__PURE__ */ __name(() => 41, "inner"); return inner() + 1; }';

        expect(engine.evaluate(`${engineFunctionSource(transformed)}()`)).toBe(42);
    });

    it('runs a function no transform touched', () => {
        expect(engine.evaluate(`${engineFunctionSource('function plain() { return 7; }')}()`)).toBe(7);
    });
});
