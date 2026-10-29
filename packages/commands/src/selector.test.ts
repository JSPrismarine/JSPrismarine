import { describe, expect, it } from 'vitest';
import { reportProgress } from '../../../.test/reportProgress';

import {
    BEDROCK_BASE_SELECTORS,
    JAVA_BASE_SELECTORS,
    JAVA_SELECTOR_ARGUMENTS,
    SelectorSyntaxError,
    parseSelector
} from './selector';

describe('the base selectors', () => {
    it('gives Java the six EntitySelectorParser names and Bedrock those plus @initiator', () => {
        expect(JAVA_BASE_SELECTORS).toEqual(['@a', '@e', '@n', '@p', '@r', '@s']);
        expect(BEDROCK_BASE_SELECTORS).toEqual(['@a', '@e', '@n', '@p', '@r', '@s', '@initiator']);
    });

    it('refuses @initiator in the Java dialect and accepts it in Bedrock', () => {
        expect(() => parseSelector('@initiator', 'java')).toThrow(SelectorSyntaxError);
        expect(parseSelector('@initiator', 'bedrock').selector.base).toBe('@initiator');
    });

    it('applies the per-base limit and sort defaults', () => {
        expect(parseSelector('@p', 'java').selector).toMatchObject({ limit: 1, sort: 'nearest' });
        expect(parseSelector('@r', 'java').selector).toMatchObject({ limit: 1, sort: 'random' });
        expect(parseSelector('@n', 'java').selector).toMatchObject({ limit: 1, sort: 'nearest' });
        expect(parseSelector('@e', 'java').selector).toMatchObject({ limit: undefined, sort: 'arbitrary' });
        expect(parseSelector('@a', 'java').selector).toMatchObject({ limit: undefined, sort: 'arbitrary' });
    });

    it('reads a bare player name as a one-target selector', () => {
        const { selector } = parseSelector('Steve', 'java');

        expect(selector.literal).toBe('Steve');
        expect(selector.limit).toBe(1);
    });
});

describe('the Java grammar', () => {
    it('parses every argument EntitySelectorOptions declares', () => {
        const { selector, notes } = parseSelector(
            '@e[x=1,y=2.5,z=-3,dx=4,dy=5,dz=6,distance=2..8,level=1..,limit=4,sort=furthest,' +
                'gamemode=creative,name="Big Bob",x_rotation=-90..90,y_rotation=..45,type=minecraft:pig,' +
                'tag=mine,tag=!theirs,team=red,scores={kills=1..,deaths=0},' +
                'advancements={minecraft:story/root=true},nbt={OnGround:1b},predicate=minecraft:tool/can_shear]',
            'java'
        );

        expect(selector).toMatchObject({
            x: { value: 1, relative: false },
            y: { value: 2.5, relative: false },
            z: { value: -3, relative: false },
            dx: 4,
            dy: 5,
            dz: 6,
            distance: { min: 2, max: 8 },
            level: { min: 1 },
            limit: 4,
            sort: 'furthest',
            xRotation: { min: -90, max: 90 },
            yRotation: { max: 45 }
        });
        expect(selector.gamemode).toEqual([{ value: 'creative', negated: false }]);
        expect(selector.name).toEqual([{ value: 'Big Bob', negated: false }]);
        expect(selector.type).toEqual([{ value: 'minecraft:pig', negated: false }]);
        expect(selector.tag).toEqual([
            { value: 'mine', negated: false },
            { value: 'theirs', negated: true }
        ]);
        expect(selector.team).toEqual([{ value: 'red', negated: false }]);
        expect(selector.scores).toEqual([
            { objective: 'kills', range: { min: 1 }, negated: false },
            { objective: 'deaths', range: { min: 0, max: 0 }, negated: false }
        ]);
        expect(selector.advancements).toEqual([{ advancement: 'minecraft:story/root', granted: true }]);
        expect(selector.nbt).toEqual([{ value: '{OnGround:1b}', negated: false }]);
        expect(selector.predicate).toEqual([{ value: 'minecraft:tool/can_shear', negated: false }]);

        const noCounterpart = notes.filter((note) => note.reason === 'no-counterpart').map((note) => note.argument);
        expect(noCounterpart.sort()).toEqual(['advancements', 'nbt', 'predicate', 'team']);
        reportProgress(
            `${JAVA_SELECTOR_ARGUMENTS.length} Java selector arguments are exercised by the parser fixture.`
        );
    });

    it('reads per-criterion advancement tests', () => {
        const { selector } = parseSelector('@a[advancements={minecraft:story/root={a=true,b=false}}]', 'java');

        expect(selector.advancements).toEqual([
            { advancement: 'minecraft:story/root', criteria: { a: true, b: false } }
        ]);
    });

    it('rejects the bounds Java rejects', () => {
        expect(() => parseSelector('@e[distance=-1]', 'java')).toThrow(/distance cannot be negative/);
        expect(() => parseSelector('@a[level=-3..]', 'java')).toThrow(/level cannot be negative/);
        expect(() => parseSelector('@e[limit=0]', 'java')).toThrow(/limit must be at least 1/);
        expect(() => parseSelector('@e[sort=closest]', 'java')).toThrow(/Unknown sort/);
    });

    it('notes a Bedrock-only argument instead of dropping it', () => {
        const { selector, notes } = parseSelector('@e[family=monster]', 'java');

        expect(selector.family).toEqual([{ value: 'monster', negated: false }]);
        expect(notes).toEqual([
            {
                argument: 'family',
                reason: 'bedrock-only',
                message: expect.stringContaining('Java has no counterpart')
            }
        ]);
    });
});

describe('the Bedrock grammar', () => {
    it('folds the split ranges, the gamemode shorthands and the signed count onto the Java shape', () => {
        const { selector } = parseSelector(
            '@e[rm=2,r=8,lm=1,l=30,rxm=-90,rx=90,rym=0,ry=45,m=c,c=-4,type=pig]',
            'bedrock'
        );

        expect(selector).toMatchObject({
            distance: { min: 2, max: 8 },
            level: { min: 1, max: 30 },
            xRotation: { min: -90, max: 90 },
            yRotation: { min: 0, max: 45 },
            limit: 4,
            sort: 'furthest'
        });
        expect(selector.gamemode).toEqual([{ value: 'creative', negated: false }]);
    });

    it('reads every gamemode shorthand Mojang documents', () => {
        const modeOf = (value: string) => parseSelector(`@a[m=${value}]`, 'bedrock').selector.gamemode[0]?.value;

        expect(['s', '0', 'survival'].map(modeOf)).toEqual(['survival', 'survival', 'survival']);
        expect(['c', '1'].map(modeOf)).toEqual(['creative', 'creative']);
        expect(['a', '2'].map(modeOf)).toEqual(['adventure', 'adventure']);
        expect(['d', '5'].map(modeOf)).toEqual(['spectator', 'spectator']);
    });

    it('allows a tilde coordinate, which Java does not', () => {
        expect(parseSelector('@e[x=~,y=~2,z=-5]', 'bedrock').selector).toMatchObject({
            x: { value: 0, relative: true },
            y: { value: 2, relative: true },
            z: { value: -5, relative: false }
        });
    });

    it('reads the inner ! of scores, which Java has no spelling for', () => {
        const { selector } = parseSelector('@a[scores={obj=!5,other=1..3}]', 'bedrock');

        expect(selector.scores).toEqual([
            { objective: 'obj', range: { min: 5, max: 5 }, negated: true },
            { objective: 'other', range: { min: 1, max: 3 }, negated: false }
        ]);
    });

    it('reads hasitem as one object and as a list', () => {
        const single = parseSelector('@a[hasitem={item=diamond,quantity=1..}]', 'bedrock').selector;
        const many = parseSelector(
            '@a[hasitem=[{item=diamond,data=0,location=slot.weapon.mainhand,slot=0},!{item=dirt,quantity=64}]]',
            'bedrock'
        ).selector;

        expect(single.hasItem).toEqual([{ item: 'diamond', quantity: { min: 1 }, negated: false }]);
        expect(many.hasItem).toEqual([
            {
                item: 'diamond',
                data: 0,
                location: 'slot.weapon.mainhand',
                slot: { min: 0, max: 0 },
                negated: false
            },
            { item: 'dirt', quantity: { min: 64, max: 64 }, negated: true }
        ]);
    });

    it('reads haspermission and both has_property spellings', () => {
        const { selector } = parseSelector(
            '@a[haspermission={camera=enabled,movement=disabled},has_property={is_baby=true},has_property={property=skin_id}]',
            'bedrock'
        );

        expect(selector.hasPermission).toEqual({ camera: 'enabled', movement: 'disabled' });
        expect(selector.hasProperty).toEqual([
            { property: 'is_baby', value: 'true', negated: false },
            { property: 'skin_id', negated: false }
        ]);
    });

    it('notes every Java-only argument a Bedrock client sends, and still parses it', () => {
        const { selector, notes } = parseSelector(
            '@e[predicate=minecraft:tool/can_shear,nbt={OnGround:1b},team=red,advancements={a=true},' +
                'distance=1..4,limit=2,sort=random,gamemode=survival,x_rotation=0..10,y_rotation=0..10,level=1..5]',
            'bedrock'
        );

        expect(notes.map((note) => note.argument).sort()).toEqual([
            'advancements',
            'distance',
            'gamemode',
            'level',
            'limit',
            'nbt',
            'predicate',
            'sort',
            'team',
            'x_rotation',
            'y_rotation'
        ]);
        expect(notes.every((note) => note.reason === 'java-only')).toBe(true);
        expect(selector.predicate).toEqual([{ value: 'minecraft:tool/can_shear', negated: false }]);
        expect(selector.team).toEqual([{ value: 'red', negated: false }]);
        expect(selector).toMatchObject({ distance: { min: 1, max: 4 }, limit: 2, sort: 'random' });
    });
});

describe('selector syntax errors', () => {
    it('names the position it stopped at', () => {
        expect(() => parseSelector('@e[type=pig', 'java')).toThrow(SelectorSyntaxError);
        expect(() => parseSelector('@q', 'java')).toThrow(/Unknown base selector/);
        expect(() => parseSelector('@e[nope=1]', 'java')).toThrow(/Unknown selector argument 'nope'/);
        expect(() => parseSelector('@a[name="unterminated]', 'java')).toThrow(/Unterminated quoted string/);
        expect(() => parseSelector('@e[c=0]', 'bedrock')).toThrow(/c cannot be 0/);
    });

    it('reports the offset of the failing token', () => {
        try {
            parseSelector('@e[nope=1]', 'java');
            expect.unreachable('the parse should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(SelectorSyntaxError);
            expect((error as SelectorSyntaxError).position).toBe(8);
        }
    });
});
