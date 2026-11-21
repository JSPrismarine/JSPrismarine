/**
 * How much of `@minecraft/server` the host implements: members over members for each served
 * version, and the same weighted by the add-on corpus's use of each member. Both are progress,
 * reported through `reportProgress`, and never gate CI.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../.test/reportProgress';
import { SCRIPT_MODULE_HISTORIES } from '../generated/scriptModules';
import { shapeAt } from '../shape/history';
import { implementationCoverage } from '../shape/implementations';
import { currentBeta } from '../shape/resolve';
import type { ScriptApiImplementations } from '../shape/implementations';
import { isRecord } from '../isRecord';
import { MemoryWorld } from '../testing/memoryWorld.test-utils';
import { serverImplementations } from './minecraftServer';
import type { PackHost } from './minecraftServer';

const SERVER = '@minecraft/server';

/** A host no member reaches: registering the implementations calls none of it. */
const unreachable = (): never => {
    throw new Error('Registering the implementations reached the host');
};

const HOST: PackHost = {
    get engine(): never {
        return unreachable();
    },
    // The implementations keep the world when they register; they read nothing from it until called.
    world: new MemoryWorld(),
    packUuid: '00000000-0000-4000-8000-000000000001',
    moduleUuid: '00000000-0000-4000-8000-000000000002',
    currentTick: unreachable,
    schedule: unreachable,
    clearRun: unreachable,
    runJob: unreachable,
    clearJob: unreachable,
    subscribe: unreachable,
    unsubscribe: unreachable,
    instance: unreachable,
    entity: unreachable,
    create: unreachable,
    eventData: unreachable,
    custom: {
        registering: unreachable,
        registerEnum: unreachable,
        registerCommand: unreachable,
        registerComponent: unreachable,
        registerDimension: unreachable
    }
};

/** The corpus's uses of `@minecraft/server`, per pack: the served version and each name's count. */
const corpusUses = (): { readonly shape: string; readonly uses: Readonly<Record<string, number>> }[] => {
    const usage: unknown = JSON.parse(
        readFileSync(join(import.meta.dirname, '..', '..', 'corpus', 'usage.json'), 'utf8')
    );
    const packs = isRecord(usage) && isRecord(usage.packs) ? Object.values(usage.packs) : [];
    return packs.flatMap((pack) => {
        const server = isRecord(pack) && isRecord(pack.modules) ? pack.modules[SERVER] : undefined;
        if (!isRecord(server) || typeof server.shape !== 'string' || !isRecord(server.uses)) return [];
        const uses: Record<string, number> = {};
        for (const [name, count] of Object.entries(server.uses)) if (typeof count === 'number') uses[name] = count;
        return [{ shape: server.shape, uses }];
    });
};

/**
 * The corpus's uses of members that need behavior, and how many of them are implemented: by
 * pack and member, and by every use.
 */
const corpusCoverage = (implementations: ScriptApiImplementations) => {
    const history = SCRIPT_MODULE_HISTORIES[SERVER];
    if (history === undefined) throw new Error(`${SERVER} has no generated shape`);
    const totals = { members: 0, implementedMembers: 0, uses: 0, implementedUses: 0 };
    for (const { shape: version, uses } of corpusUses()) {
        const shape = shapeAt(history, version);
        for (const [name, count] of Object.entries(uses)) {
            const [owner, member] = name.split('.');
            if (owner === undefined || member === undefined) continue;
            const declared = shape.declarations.get(owner);
            const kind = declared?.members.get(member)?.kind;
            if (declared?.declaration.kind !== 'class' || kind === undefined || kind === 'constant') continue;
            const implemented = implementations.find(SERVER, owner, member) !== undefined;
            totals.members++;
            totals.uses += count;
            if (implemented) {
                totals.implementedMembers++;
                totals.implementedUses += count;
            }
        }
    }
    return totals;
};

const percent = (part: number, whole: number): string => `${((100 * part) / whole).toFixed(1)}%`;

describe('the implemented @minecraft/server members', () => {
    const implementations = serverImplementations(HOST);

    it('reports how many members of each served version have behavior', () => {
        const history = SCRIPT_MODULE_HISTORIES[SERVER];
        if (history === undefined) throw new Error(`${SERVER} has no generated shape`);
        // Every version a pack can be served: the newest stable minor of each major, and the shipped beta.
        const served = [...Object.values(history.resolves), currentBeta(history)].filter(
            (version) => version !== undefined
        );
        expect(served.length).toBeGreaterThan(1);
        for (const version of served) {
            const { implemented, total } = implementationCoverage(shapeAt(history, version), implementations);
            expect(implemented).toBeLessThanOrEqual(total);
            reportProgress(
                `${SERVER} ${version}: ${implemented} of ${total} members implemented`,
                'Script API coverage'
            );
        }
    });

    it("reports how much of the corpus's use of members has behavior", () => {
        const { members, implementedMembers, uses, implementedUses } = corpusCoverage(implementations);
        expect(members).toBeGreaterThan(0);
        reportProgress(
            `${SERVER} in the add-on corpus: ${implementedMembers} of ${members} pack members implemented ` +
                `(${percent(implementedMembers, members)}), ${implementedUses} of ${uses} uses ` +
                `(${percent(implementedUses, uses)})`,
            'Script API coverage'
        );
    });
});
