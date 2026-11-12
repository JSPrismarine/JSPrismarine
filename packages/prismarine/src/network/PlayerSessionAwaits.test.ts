import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CallExpression, MethodDeclaration, Node, PropertyAccessExpression } from 'tsc-ts/api';
import { getTextOfNode, parseSourceFile, SyntaxKind, walkPreorder } from 'tsc-ts/api';
import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../.test/reportProgress';

const isMethod = (node: Node): node is MethodDeclaration => node.kind === SyntaxKind.MethodDeclaration;
const isCall = (node: Node): node is CallExpression => node.kind === SyntaxKind.CallExpression;
const isPropertyAccess = (node: Node): node is PropertyAccessExpression =>
    node.kind === SyntaxKind.PropertyAccessExpression;

/** One method of a class: the `await`s in its body and the methods it calls on `this`. */
type MethodFacts = { readonly awaits: number; readonly calls: ReadonlySet<string> };

/** Every method a module's classes declare, by name, with the facts this test reads. */
const methodsOf = (url: URL): Map<string, MethodFacts> => {
    const file = fileURLToPath(url);
    const methods = new Map<string, MethodFacts>();
    walkPreorder(parseSourceFile(file, readFileSync(file, 'utf8')), (node) => {
        if (!isMethod(node) || node.body === undefined) return;
        let awaits = 0;
        const calls = new Set<string>();
        walkPreorder(node.body, (inner) => {
            if (inner.kind === SyntaxKind.AwaitExpression) awaits++;
            if (!isCall(inner) || !isPropertyAccess(inner.expression)) return;
            if (inner.expression.expression.kind === SyntaxKind.ThisKeyword)
                calls.add(getTextOfNode(inner.expression.name));
        });
        methods.set(getTextOfNode(node.name), { awaits, calls });
        return 'skip';
    });
    return methods;
};

/** The methods reachable from `start` through calls on `this`, and the `await`s in them. */
const reachableAwaits = (methods: Map<string, MethodFacts>, start: string) => {
    const seen = new Set<string>();
    const queue = [start];
    let awaits = 0;
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
        const method = methods.get(name);
        if (method === undefined || seen.has(name)) continue;
        seen.add(name);
        awaits += method.awaits;
        queue.push(...method.calls);
    }
    return { methods: seen.size, awaits };
};

const total = (methods: Map<string, MethodFacts>): number =>
    [...methods.values()].reduce((sum, method) => sum + method.awaits, 0);

/**
 * The awaits a tick can still reach in the owner's view. `World.update` runs each player's part
 * of the tick through `PlayerSession.updatePlayer`, so the count follows that method's calls on
 * the session. Calls on other objects are not followed, so this is a lower bound and a progress
 * figure, not a gate.
 */
describe("the owner's view's awaits", () => {
    it('counts the awaits reachable from the tick', () => {
        const session = methodsOf(new URL('./PlayerSession.ts', import.meta.url));
        const world = methodsOf(new URL('../world/World.ts', import.meta.url));
        const fromPlayer = reachableAwaits(session, 'updatePlayer');
        const fromWorld = reachableAwaits(world, 'update');

        expect(fromPlayer.methods).toBeGreaterThan(1);
        expect(fromWorld.methods).toBeGreaterThan(1);
        reportProgress(
            `${fromWorld.awaits} awaits in ${fromWorld.methods} World methods reachable from update, ` +
                `${fromPlayer.awaits} in ${fromPlayer.methods} PlayerSession methods reachable from updatePlayer, ` +
                `${total(session)} in PlayerSession`,
            "Awaits in the owner's view"
        );
    });

    it('writes and queues without awaiting in the methods the input handlers run in their unit', () => {
        // `SetPlayerGameType`, `SetLocalPlayerAsInitialized` and the moves that land a flyer run
        // these in an input's unit. An await in one would put the writes after it outside the
        // unit, and the packets after it behind the transport's framing.
        const session = methodsOf(new URL('./PlayerSession.ts', import.meta.url));
        const inUnit = [
            'setGamemode',
            'setFlying',
            'stopMining',
            'completeSpawn',
            'sendInventory',
            'sendArmorFor',
            'sendAttributes',
            'sendStatusEffects',
            'announceSettings',
            'sendGameTypeChange',
            'sendAbilityChange'
        ];

        for (const name of inUnit) expect(session.get(name)?.awaits, name).toBe(0);
    });
});
