import { describe, expect, it } from 'vitest';

import type {
    AnimationRequest,
    BlockRef,
    CameraShake,
    CommandSource,
    DataTarget,
    EntityRef,
    FogChange,
    ItemSlot,
    TitleInstruction
} from '../host';
import { createCommandSource } from '../host';
import type { TestCommandHostOverrides } from '../testing';
import { testCommandHost, testEntity } from '../testing';
import { registerVanillaCommands } from './vanilla';

/** Runs one command line and returns what every executed branch produced. */
const run = (
    line: string,
    overrides: TestCommandHostOverrides = {},
    extra: { entity?: EntityRef; feedback?: string[] } = {}
): unknown[] => {
    const host = testCommandHost(overrides);
    const source: CommandSource = createCommandSource({
        host,
        ...(extra.entity === undefined ? {} : { entity: extra.entity }),
        permissionLevel: 4,
        onFeedback: (message) => extra.feedback?.push(message)
    });
    return registerVanillaCommands().getDispatcher().execute(line, source);
};

const pig = testEntity({ id: 'pig-1', type: 'minecraft:pig', name: 'Pig', isPlayer: false });
const steve = testEntity({ id: 'steve', name: 'Steve' });

describe('the Bedrock-only commands', () => {
    describe('/testfor', () => {
        it('counts what the selector matched', () => {
            expect(run('testfor @e', { entities: { select: () => [pig, steve] } })).toEqual([2]);
        });

        it('answers zero when nothing matched', () => {
            expect(run('testfor @e[type=cow]', { entities: { select: () => [] } })).toEqual([0]);
        });
    });

    describe('/testforblock', () => {
        const stone: BlockRef = { identifier: 'minecraft:stone', states: {} };

        it('matches the block at the position', () => {
            expect(run('testforblock 1 2 3 minecraft:stone', { world: { getBlock: () => stone } })).toEqual([1]);
        });

        it('fails on a different block', () => {
            expect(run('testforblock 1 2 3 minecraft:dirt', { world: { getBlock: () => stone } })).toEqual([0]);
        });

        it('fails when the chunk is not loaded', () => {
            expect(run('testforblock 1 2 3 minecraft:stone', { world: { getBlock: () => undefined } })).toEqual([0]);
        });

        it('compares only the states the line names', () => {
            const stairs: BlockRef = {
                identifier: 'minecraft:oak_stairs',
                states: { weirdo_direction: 2, upside_down_bit: false }
            };
            const world = { getBlock: () => stairs };

            expect(run('testforblock 1 2 3 minecraft:oak_stairs', { world })).toEqual([1]);
            expect(run('testforblock 1 2 3 minecraft:oak_stairs ["weirdo_direction"=2]', { world })).toEqual([1]);
            expect(run('testforblock 1 2 3 minecraft:oak_stairs ["weirdo_direction"=3]', { world })).toEqual([0]);
        });

        it('resolves a relative position against the source', () => {
            const asked: { x: number; y: number; z: number }[] = [];
            run(
                'testforblock ~1 ~ ~-1 minecraft:stone',
                {
                    world: {
                        getBlock: (_dimension, position) => {
                            asked.push(position);
                            return stone;
                        }
                    }
                },
                { entity: testEntity({ position: { x: 10, y: 64, z: 10 } }) }
            );

            expect(asked).toEqual([{ x: 11, y: 64, z: 9 }]);
        });
    });

    describe('/testforblocks', () => {
        it('returns how many blocks matched', () => {
            expect(run('testforblocks 0 0 0 1 1 1 10 0 10', { world: { compareRegions: () => 8 } })).toEqual([8]);
        });

        it('passes the masked flag only for the masked mode', () => {
            const modes: boolean[] = [];
            const world = { compareRegions: (..._args: never[]) => 0 };
            const capture = {
                compareRegions: (
                    _dimension: string,
                    _begin: unknown,
                    _end: unknown,
                    _destination: unknown,
                    masked: boolean
                ) => {
                    modes.push(masked);
                    return 1;
                }
            };
            void world;

            run('testforblocks 0 0 0 1 1 1 10 0 10', { world: capture });
            run('testforblocks 0 0 0 1 1 1 10 0 10 all', { world: capture });
            run('testforblocks 0 0 0 1 1 1 10 0 10 masked', { world: capture });

            expect(modes).toEqual([false, false, true]);
        });
    });

    describe('/daylock', () => {
        /** The rule name and value one `/daylock` line wrote. */
        const writes = (line: string) => {
            const written: [string, string | number | boolean][] = [];
            run(line, {
                world: {
                    setGameRule: (name, value) => {
                        written.push([name, value]);
                        return true;
                    }
                }
            });
            return written;
        };

        it('turns the daylight cycle off, which is what locking the day means', () => {
            expect(writes('daylock')).toEqual([['minecraft:advance_time', false]]);
            expect(writes('daylock true')).toEqual([['minecraft:advance_time', false]]);
        });

        it('turns the cycle back on for false', () => {
            expect(writes('daylock false')).toEqual([['minecraft:advance_time', true]]);
        });

        it('reports a failure when the world refused the rule', () => {
            expect(run('daylock', { world: { setGameRule: () => false } })).toEqual([0]);
        });
    });

    describe('/titleraw', () => {
        /** The instructions one line sent. */
        const titles = (line: string) => {
            const sent: TitleInstruction[] = [];
            run(line, {
                entities: { select: () => [steve] },
                server: { sendTitle: (_targets, title) => sent.push(title) }
            });
            return sent;
        };

        it('marks the text as raw where /title does not', () => {
            expect(titles('titleraw @a title {"rawtext":[{"text":"hi"}]}')).toEqual([
                { kind: 'title', text: '{"rawtext":[{"text":"hi"}]}', raw: true }
            ]);
            expect(titles('title @a title hi')).toEqual([{ kind: 'title', text: 'hi', raw: false }]);
        });

        it('carries clear and reset with no text at all', () => {
            expect(titles('titleraw @a clear')).toEqual([{ kind: 'clear' }]);
            expect(titles('title @a reset')).toEqual([{ kind: 'reset' }]);
        });

        it('carries the three durations of the times form', () => {
            expect(titles('titleraw @a times 5 100 5')).toEqual([{ kind: 'times', fadeIn: 5, stay: 100, fadeOut: 5 }]);
            expect(titles('title @a times 1 2 3')).toEqual([{ kind: 'times', fadeIn: 1, stay: 2, fadeOut: 3 }]);
        });
    });

    describe('/replaceitem', () => {
        /** What one line put where. */
        const placed = (line: string) => {
            const slots: { target: DataTarget; slot: ItemSlot; item: string; count: number; mode?: string }[] = [];
            run(line, {
                entities: { select: () => [steve] },
                data: {
                    setSlot: (target, slot, item, count, mode) => {
                        slots.push({ target, slot, item, count, ...(mode === undefined ? {} : { mode }) });
                        return count;
                    }
                }
            });
            return slots;
        };

        it('names the slot and its index separately, as Bedrock spells it', () => {
            expect(placed('replaceitem entity @s slot.hotbar 3 minecraft:diamond 5')).toEqual([
                {
                    target: { kind: 'entity', entity: steve },
                    slot: { name: 'slot.hotbar', index: 3, count: 5 },
                    item: 'minecraft:diamond',
                    count: 5,
                    mode: 'replace'
                }
            ]);
        });

        it('defaults the amount to one', () => {
            expect(placed('replaceitem entity @s slot.weapon.mainhand 0 minecraft:stone')[0]?.count).toBe(1);
        });

        it('carries the old-item handling the line asked for', () => {
            expect(placed('replaceitem entity @s slot.hotbar 0 keep minecraft:stone 2')[0]?.mode).toBe('keep');
            expect(placed('replaceitem entity @s slot.hotbar 0 destroy minecraft:stone')[0]?.mode).toBe('destroy');
        });

        it('returns how many items went in', () => {
            expect(
                run('replaceitem entity @s slot.hotbar 0 minecraft:stone 7', {
                    entities: { select: () => [steve] },
                    data: { setSlot: (_target, _slot, _item, count) => count }
                })
            ).toEqual([7]);
        });

        it("addresses a container block, which is Mojang's other two overloads", () => {
            expect(placed('replaceitem block 1 70 2 slot.container 4 minecraft:diamond 5')).toEqual([
                {
                    target: { kind: 'block', dimension: 'minecraft:overworld', position: { x: 1, y: 70, z: 2 } },
                    slot: { name: 'slot.container', index: 4, count: 5 },
                    item: 'minecraft:diamond',
                    count: 5,
                    mode: 'replace'
                }
            ]);
        });

        it('gives the block form the same old-item handling the entity form has', () => {
            expect(placed('replaceitem block 0 0 0 slot.container 0 keep minecraft:stone')[0]?.mode).toBe('keep');
        });

        it('offers the block form only the slot group Bedrock names', () => {
            expect(() => placed('replaceitem block 0 0 0 slot.hotbar 0 minecraft:stone')).toThrow();
        });
    });

    describe('/camerashake', () => {
        /** What one line asked the client to do. */
        const shakes = (line: string) => {
            const sent: CameraShake[] = [];
            run(line, {
                entities: { select: () => [steve] },
                server: {
                    shakeCamera: (_players, shake) => {
                        sent.push(shake);
                        return 1;
                    }
                }
            });
            return sent;
        };

        it('defaults the intensity, duration and type', () => {
            expect(shakes('camerashake add @a')).toEqual([
                { action: 'add', intensity: 1, seconds: 1, shakeType: 'positional' }
            ]);
        });

        it('carries every argument the line gave', () => {
            expect(shakes('camerashake add @a 0.5 3 rotational')).toEqual([
                { action: 'add', intensity: 0.5, seconds: 3, shakeType: 'rotational' }
            ]);
        });

        it('stops a shake', () => {
            expect(shakes('camerashake stop @a')[0]?.action).toBe('stop');
        });

        it('refuses an intensity above the four the client accepts', () => {
            expect(() => run('camerashake add @a 9')).toThrow();
        });
    });

    describe('/fog', () => {
        /** What one line changed. */
        const changes = (line: string) => {
            const sent: FogChange[] = [];
            run(line, {
                entities: { select: () => [steve] },
                server: {
                    setFog: (_players, change) => {
                        sent.push(change);
                        return 1;
                    }
                }
            });
            return sent;
        };

        it('pushes a layer under the id a later pop names it by', () => {
            expect(changes('fog @a push minecraft:fog_crimson_forest myfog')).toEqual([
                { mode: 'push', fogId: 'minecraft:fog_crimson_forest', userId: 'myfog' }
            ]);
        });

        it('pops and removes by that id', () => {
            expect(changes('fog @a pop myfog')).toEqual([{ mode: 'pop', userId: 'myfog' }]);
            expect(changes('fog @a remove myfog')).toEqual([{ mode: 'remove', userId: 'myfog' }]);
        });

        it('reports zero when no stack changed', () => {
            expect(run('fog @a pop nothing', { entities: { select: () => [steve] } })).toEqual([0]);
        });
    });

    describe('/playanimation', () => {
        /** What one line asked to be played. */
        const requests = (line: string) => {
            const sent: AnimationRequest[] = [];
            run(line, {
                entities: { select: () => [pig] },
                server: {
                    playAnimation: (_entities, request) => {
                        sent.push(request);
                        return 1;
                    }
                }
            });
            return sent;
        };

        it('carries the animation on its own', () => {
            expect(requests('playanimation @e animation.pig.baby_transform')).toEqual([
                { animation: 'animation.pig.baby_transform' }
            ]);
        });

        it('adds each optional argument only once the line reaches it', () => {
            expect(requests('playanimation @e anim next')).toEqual([{ animation: 'anim', nextState: 'next' }]);
            expect(requests('playanimation @e anim next 0.5')).toEqual([
                { animation: 'anim', nextState: 'next', blendOutTime: 0.5 }
            ]);
            expect(requests('playanimation @e anim next 0.5 query.all_animations_finished ctrl')).toEqual([
                {
                    animation: 'anim',
                    nextState: 'next',
                    blendOutTime: 0.5,
                    stopExpression: 'query.all_animations_finished',
                    controller: 'ctrl'
                }
            ]);
        });
    });
});
