import { describe, expect, it } from 'vitest';

import { createCommandSource } from './host';
import type { CommandSource, EntityRef } from './host';
import type { SelectorFacts } from './matching';
import { matchSelector } from './matching';
import { parseSelector } from './selector';
import { testCommandHost, testEntity } from './testing';

const at = (x: number, y: number, z: number, overrides: Partial<EntityRef> = {}): EntityRef =>
    testEntity({ position: { x, y, z }, ...overrides });

const sourceAt = (x: number, y: number, z: number, entity?: EntityRef): CommandSource =>
    createCommandSource({
        host: testCommandHost(),
        position: { x, y, z },
        ...(entity === undefined ? {} : { entity })
    });

interface Extras {
    readonly facts?: Partial<SelectorFacts>;
    readonly random?: () => number;
}

const resolve = (
    input: string,
    candidates: readonly EntityRef[],
    source = sourceAt(0, 0, 0),
    extras: Extras = {}
): readonly EntityRef[] => matchSelector(parseSelector(input, 'java').selector, source, { candidates, ...extras });

describe('matchSelector', () => {
    it('answers the source entity for @s without looking at the candidates', () => {
        const self = at(10, 10, 10, { id: 'self', name: 'Self' });
        const other = at(0, 0, 0, { id: 'other', name: 'Other' });

        expect(resolve('@s', [other], sourceAt(0, 0, 0, self))).toEqual([self]);
    });

    it('answers nothing for @s run from the console', () => {
        expect(resolve('@s', [at(0, 0, 0)])).toEqual([]);
    });

    it('keeps only players for @a', () => {
        const player = at(1, 0, 0, { id: 'p', isPlayer: true });
        const pig = at(2, 0, 0, { id: 'e', isPlayer: false, type: 'minecraft:pig' });

        expect(resolve('@a', [player, pig]).map((entity) => entity.id)).toEqual(['p']);
    });

    it('takes the nearest single match for @p', () => {
        const near = at(1, 0, 0, { id: 'near' });
        const far = at(40, 0, 0, { id: 'far' });

        expect(resolve('@p', [far, near]).map((entity) => entity.id)).toEqual(['near']);
    });

    it('returns every entity for @e with no limit', () => {
        const entities = [at(1, 0, 0, { id: 'a' }), at(2, 0, 0, { id: 'b' }), at(3, 0, 0, { id: 'c' })];

        expect(resolve('@e', entities)).toHaveLength(3);
    });

    it('matches a type with or without the namespace', () => {
        const pig = at(0, 0, 0, { id: 'pig', type: 'minecraft:pig', isPlayer: false });
        const cow = at(0, 0, 0, { id: 'cow', type: 'minecraft:cow', isPlayer: false });

        expect(resolve('@e[type=pig]', [pig, cow]).map((entity) => entity.id)).toEqual(['pig']);
        expect(resolve('@e[type=minecraft:pig]', [pig, cow]).map((entity) => entity.id)).toEqual(['pig']);
    });

    it('excludes a negated type', () => {
        const pig = at(0, 0, 0, { id: 'pig', type: 'minecraft:pig', isPlayer: false });
        const cow = at(0, 0, 0, { id: 'cow', type: 'minecraft:cow', isPlayer: false });

        expect(resolve('@e[type=!pig]', [pig, cow]).map((entity) => entity.id)).toEqual(['cow']);
    });

    it('ranges over distance from the source', () => {
        const close = at(3, 0, 0, { id: 'close' });
        const far = at(20, 0, 0, { id: 'far' });

        expect(resolve('@e[distance=..5]', [close, far]).map((entity) => entity.id)).toEqual(['close']);
        expect(resolve('@e[distance=5..]', [close, far]).map((entity) => entity.id)).toEqual(['far']);
    });

    it('measures distance from an x, y and z the selector names', () => {
        const near = at(100, 0, 0, { id: 'near' });

        expect(resolve('@e[x=100,y=0,z=0,distance=..1]', [near]).map((entity) => entity.id)).toEqual(['near']);
        expect(resolve('@e[distance=..1]', [near])).toEqual([]);
    });

    it('bounds a dx volume and leaves the unnamed axes free', () => {
        const inside = at(2, 500, 0, { id: 'inside' });
        const outside = at(9, 500, 0, { id: 'outside' });

        expect(resolve('@e[dx=3]', [inside, outside]).map((entity) => entity.id)).toEqual(['inside']);
    });

    it('cuts to the limit after sorting', () => {
        const entities = [at(9, 0, 0, { id: 'c' }), at(1, 0, 0, { id: 'a' }), at(5, 0, 0, { id: 'b' })];

        expect(resolve('@e[limit=2,sort=nearest]', entities).map((entity) => entity.id)).toEqual(['a', 'b']);
        expect(resolve('@e[limit=2,sort=furthest]', entities).map((entity) => entity.id)).toEqual(['c', 'b']);
    });

    it('reads a Bedrock negative c as furthest-first', () => {
        const entities = [at(1, 0, 0, { id: 'a' }), at(9, 0, 0, { id: 'c' })];
        const selector = parseSelector('@e[c=-1]', 'bedrock').selector;

        expect(matchSelector(selector, sourceAt(0, 0, 0), { candidates: entities }).map((entity) => entity.id)).toEqual(
            ['c']
        );
    });

    it('draws sort=random from the supplied generator', () => {
        const entities = [at(1, 0, 0, { id: 'a' }), at(2, 0, 0, { id: 'b' }), at(3, 0, 0, { id: 'c' })];

        const picked = resolve('@e[sort=random,limit=1]', entities, sourceAt(0, 0, 0), { random: () => 0 });
        expect(picked).toHaveLength(1);
        // A generator that always answers 0 rotates the list by one each pass,
        // so the result is deterministic rather than merely plausible.
        expect(picked.map((entity) => entity.id)).toEqual(['b']);
    });

    it('fails a gamemode test when the host does not track game modes', () => {
        const player = at(0, 0, 0, { id: 'p' });

        expect(resolve('@a[gamemode=creative]', [player])).toEqual([]);
    });

    it('matches a gamemode the host answers', () => {
        const creative = at(0, 0, 0, { id: 'creative' });
        const survival = at(0, 0, 0, { id: 'survival' });
        const facts = { gameMode: (entity: EntityRef) => entity.id };

        expect(resolve('@a[gamemode=creative]', [creative, survival], sourceAt(0, 0, 0), { facts })).toEqual([
            creative
        ]);
        expect(resolve('@a[gamemode=!creative]', [creative, survival], sourceAt(0, 0, 0), { facts })).toEqual([
            survival
        ]);
    });

    it('ranges over an experience level', () => {
        const low = at(0, 0, 0, { id: '3' });
        const high = at(0, 0, 0, { id: '30' });
        const facts = { level: (entity: EntityRef) => Number(entity.id) };

        expect(resolve('@a[level=10..]', [low, high], sourceAt(0, 0, 0), { facts }).map((entity) => entity.id)).toEqual(
            ['30']
        );
    });

    it('tests tags, including the bare presence test', () => {
        const tagged = at(0, 0, 0, { id: 'tagged' });
        const bare = at(0, 0, 0, { id: 'bare' });
        const facts = { tags: (entity: EntityRef) => (entity.id === 'tagged' ? ['winner'] : []) };

        expect(resolve('@e[tag=winner]', [tagged, bare], sourceAt(0, 0, 0), { facts })).toEqual([tagged]);
        expect(resolve('@e[tag=!winner]', [tagged, bare], sourceAt(0, 0, 0), { facts })).toEqual([bare]);
        expect(resolve('@e[tag=]', [tagged, bare], sourceAt(0, 0, 0), { facts })).toEqual([tagged]);
    });

    it('ranges over a score and treats a missing score as no match', () => {
        const scored = at(0, 0, 0, { id: 'scored' });
        const unscored = at(0, 0, 0, { id: 'unscored' });
        const facts = { score: (entity: EntityRef) => (entity.id === 'scored' ? 7 : undefined) };

        expect(resolve('@e[scores={kills=5..}]', [scored, unscored], sourceAt(0, 0, 0), { facts })).toEqual([scored]);
        expect(resolve('@e[scores={kills=..5}]', [scored, unscored], sourceAt(0, 0, 0), { facts })).toEqual([]);
    });

    it('wraps a yaw before comparing it', () => {
        const facing = at(0, 0, 0, { id: 'facing', rotation: { yaw: 350, pitch: 0 } });

        expect(resolve('@e[y_rotation=-20..-5]', [facing]).map((entity) => entity.id)).toEqual(['facing']);
    });

    it('matches a bare player name', () => {
        const steve = at(0, 0, 0, { id: 'steve', name: 'Steve' });
        const alex = at(0, 0, 0, { id: 'alex', name: 'Alex' });

        expect(resolve('Alex', [steve, alex]).map((entity) => entity.id)).toEqual(['alex']);
    });

    it('tests a Bedrock family through the host', () => {
        const zombie = at(0, 0, 0, { id: 'zombie', isPlayer: false, type: 'minecraft:zombie' });
        const pig = at(0, 0, 0, { id: 'pig', isPlayer: false, type: 'minecraft:pig' });
        const facts = { families: (entity: EntityRef) => (entity.id === 'zombie' ? ['monster', 'undead'] : ['mob']) };
        const selector = parseSelector('@e[family=monster]', 'bedrock').selector;

        expect(
            matchSelector(selector, sourceAt(0, 0, 0), { candidates: [zombie, pig], facts }).map((entity) => entity.id)
        ).toEqual(['zombie']);
    });
});
