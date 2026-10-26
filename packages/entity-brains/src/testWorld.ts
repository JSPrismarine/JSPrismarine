/**
 * A typed double for the {@link BrainWorld} seam.
 *
 * It is a real implementation, not a mock: entities, blocks, points of interest and the clock are
 * plain data a test writes, and every {@link BrainWorld} member answers from that data. Tests
 * script the random source rather than seeding it, so a draw is a fact of the test.
 *
 * ```typescript
 * const world = new TestWorld({ dayTime: 2000 });
 * const body = world.spawn('minecraft:villager', { x: 0, y: 64, z: 0 });
 * const brain = VILLAGER_BRAIN.makeBrain();
 * body.attach(brain);
 * VILLAGER_BRAIN.updateActivity(body.context);
 * ```
 */

import type { Brain } from './brain.js';
import type {
    BlockPos,
    BrainContext,
    BrainEntity,
    BrainItem,
    BrainItemEntity,
    BrainMob,
    BrainNavigation,
    BrainWorld,
    PoiRecord,
    RandomPosRequest,
    Vec3
} from './world.js';
import { distanceSquared } from './world.js';

/** What a test says about an entity it places. */
export interface TestEntityOptions {
    readonly id?: string;
    readonly position?: Vec3;
    readonly alive?: boolean;
    readonly baby?: boolean;
    readonly spectator?: boolean;
    readonly creative?: boolean;
    readonly typeTags?: readonly string[];
    readonly conditions?: readonly string[];
    readonly mainHandItem?: BrainItem;
    readonly offHandItem?: BrainItem;
    readonly armorItems?: readonly BrainItem[];
    readonly attributes?: Readonly<Record<string, number>>;
}

/** A plain entity the test world hands to sensors and behaviors. */
export class TestEntity implements BrainEntity {
    public readonly id: string;
    public readonly type: string;
    public position: Vec3;
    public alive: boolean;
    public baby: boolean;
    public spectator: boolean;
    public creative: boolean;
    public typeTags: Set<string>;
    public conditions: Set<string>;
    public mainHandItem: BrainItem | undefined;
    public offHandItem: BrainItem | undefined;
    public armorItems: BrainItem[];

    public constructor(type: string, options: TestEntityOptions = {}) {
        this.type = type;
        this.id = options.id ?? `${type}#${nextEntityId++}`;
        this.position = options.position ?? { x: 0, y: 0, z: 0 };
        this.alive = options.alive ?? true;
        this.baby = options.baby ?? false;
        this.spectator = options.spectator ?? false;
        this.creative = options.creative ?? false;
        this.typeTags = new Set(options.typeTags ?? []);
        this.conditions = new Set(options.conditions ?? []);
        this.mainHandItem = options.mainHandItem;
        this.offHandItem = options.offHandItem;
        this.armorItems = [...(options.armorItems ?? [])];
    }

    /** Whether combat AI may choose this test entity as a target. */
    public canBeTargeted(): boolean {
        return this.alive && !this.spectator && !this.creative;
    }
}

let nextEntityId = 1;

/** A dropped item stack in the test world. */
export class TestItemEntity extends TestEntity implements BrainItemEntity {
    public constructor(
        public readonly item: BrainItem,
        public readonly count: number,
        options: TestEntityOptions = {}
    ) {
        super('minecraft:item', options);
    }
}

/** Records every navigation call so a test can assert on movement without a path finder. */
export class TestNavigation implements BrainNavigation {
    /** Every `moveTo` call, in order. */
    public readonly moves: { target: Vec3; speedModifier: number }[] = [];
    public stopped = 0;
    /** Positions `canReach` and `moveTo` refuse. A test adds one to make a target unreachable. */
    public readonly unreachable: Vec3[] = [];
    public done = true;
    public stuck = false;

    /** Records the call and reports false for a target listed in {@link TestNavigation.unreachable}. */
    public moveTo(target: Vec3, speedModifier: number): boolean {
        if (!this.canReach(target)) {
            return false;
        }
        this.moves.push({ target, speedModifier });
        this.done = false;
        return true;
    }

    /** False from the first accepted `moveTo` until `stop`, or until a test sets `done`. */
    public isDone(): boolean {
        return this.done;
    }

    /** Whatever a test put in `stuck`. Nothing in the double sets it. */
    public isStuck(): boolean {
        return this.stuck;
    }

    /** True unless the target is listed in {@link TestNavigation.unreachable}. */
    public canReach(target: Vec3): boolean {
        return !this.unreachable.some((pos) => pos.x === target.x && pos.y === target.y && pos.z === target.z);
    }

    /** Counts the call in `stopped` and marks the path done. */
    public stop(): void {
        this.stopped++;
        this.done = true;
    }

    /** The last position the mob was told to walk to. */
    public get lastMove(): { target: Vec3; speedModifier: number } | undefined {
        return this.moves[this.moves.length - 1];
    }
}

/** A mob in the test world, with its brain and the calls behaviors made on it. */
export class TestMob extends TestEntity implements BrainMob {
    public readonly navigation = new TestNavigation();
    /** Every `lookAt` call, in order. */
    public readonly looks: Vec3[] = [];
    /** Every `attack` call, in order. */
    public readonly attacks: BrainEntity[] = [];
    /** Every `playSound` call, in order. */
    public readonly sounds: string[] = [];
    public jumps = 0;

    private attached: Brain | undefined;
    private readonly attributes: Record<string, number>;

    public constructor(
        private readonly world: TestWorld,
        type: string,
        options: TestEntityOptions = {}
    ) {
        super(type, options);
        this.attributes = { 'minecraft:follow_range': 16, 'minecraft:tempt_range': 10, ...options.attributes };
    }

    /** Gives the mob its brain. Separate from the constructor because a brain needs a body. */
    public attach(brain: Brain): this {
        this.attached = brain;
        return this;
    }

    public get brain(): Brain {
        if (this.attached === undefined) {
            throw new Error(`${this.type} has no brain attached; call attach() first`);
        }
        return this.attached;
    }

    /** The {@link BrainContext} for this mob in its world. */
    public get context(): BrainContext {
        return { world: this.world, body: this };
    }

    /** Adds or removes an entity condition, which is how a test watches flags such as `aggressive`. */
    public setCondition(condition: string, value: boolean): void {
        if (value) {
            this.conditions.add(condition);
        } else {
            this.conditions.delete(condition);
        }
    }

    /** Records the call in `looks`. The double has no facing of its own. */
    public lookAt(position: Vec3): void {
        this.looks.push(position);
    }

    /** Counts the call in `jumps`. */
    public jump(): void {
        this.jumps++;
    }

    /** Records the target in `attacks`. No damage is dealt; the double has no combat. */
    public attack(target: BrainEntity): void {
        this.attacks.push(target);
    }

    /** Records the sound name in `sounds`. */
    public playSound(sound: string): void {
        this.sounds.push(sound);
    }

    /** The attribute a test passed in, or 0. Follow range and tempt range have defaults. */
    public attribute(attribute: string): number {
        return this.attributes[attribute] ?? 0;
    }

    /** One brain tick for this mob: `updateActivity` is the caller's, as it is in Java. */
    public tickBrain(): void {
        this.brain.tick(this.context);
    }
}

/** How a test sets up its world. */
export interface TestWorldOptions {
    readonly dimension?: string;
    readonly gameTime?: number;
    readonly dayTime?: number;
    /**
     * The values {@link BrainWorld.random} returns, consumed in order and then repeating the last.
     * Defaults to always returning 0.
     */
    readonly randomValues?: readonly number[];
    /** Whether an entity can see another. Defaults to always. */
    readonly lineOfSight?: (body: BrainEntity, target: BrainEntity) => boolean;
    /** Whether a target is attackable. Defaults to anything alive that is not the body. */
    readonly attackable?: (body: BrainEntity, target: BrainEntity) => boolean;
    /** The melee reach, in blocks. Defaults to 2. */
    readonly meleeRange?: number;
}

/** A {@link BrainWorld} backed by plain data. */
export class TestWorld implements BrainWorld {
    public readonly dimension: string;
    /** Advance with {@link TestWorld.advance}. */
    public time: number;
    public dayTimeTicks: number;
    /** Every entity in the world, including the mobs. */
    public readonly entities: TestEntity[] = [];
    public readonly items: TestItemEntity[] = [];
    /** Block ids by `x,y,z`. Anything unset is `minecraft:air`. */
    public readonly blocks = new Map<string, string>();
    /** Block tags by `x,y,z`. */
    public readonly blockTags = new Map<string, Set<string>>();
    public readonly pois: (PoiRecord & { claimedBy?: string })[] = [];
    /** Every `playSound` call, in order. */
    public readonly sounds: { sound: string; pos: Vec3 }[] = [];
    /** Every `emitGameEvent` call, in order. */
    public readonly gameEvents: { event: string; pos: Vec3; source?: BrainEntity }[] = [];
    /**
     * What {@link TestWorld.randomPos} returns. A test sets it to make a wander deterministic;
     * `undefined` means the draw found nothing, which is a real outcome in Java too.
     */
    public nextRandomPos: Vec3 | undefined = undefined;

    private readonly randomValues: readonly number[];
    private randomIndex = 0;
    private readonly lineOfSight: (body: BrainEntity, target: BrainEntity) => boolean;
    private readonly attackable: (body: BrainEntity, target: BrainEntity) => boolean;
    private readonly meleeRange: number;

    public constructor(options: TestWorldOptions = {}) {
        this.dimension = options.dimension ?? 'minecraft:overworld';
        this.time = options.gameTime ?? 0;
        this.dayTimeTicks = options.dayTime ?? 0;
        this.randomValues = options.randomValues ?? [0];
        this.lineOfSight = options.lineOfSight ?? (() => true);
        this.attackable = options.attackable ?? ((body, target) => target.alive && target.id !== body.id);
        this.meleeRange = options.meleeRange ?? 2;
    }

    /** Places a mob and registers it as an entity. */
    public spawn(type: string, position: Vec3, options: TestEntityOptions = {}): TestMob {
        const mob = new TestMob(this, type, { ...options, position });
        this.entities.push(mob);
        return mob;
    }

    /** Places a non-mob entity, such as a player or a target. */
    public place(type: string, position: Vec3, options: TestEntityOptions = {}): TestEntity {
        const entity = new TestEntity(type, { ...options, position });
        this.entities.push(entity);
        return entity;
    }

    /** Drops an item stack. */
    public drop(item: BrainItem, position: Vec3, count = 1): TestItemEntity {
        const entity = new TestItemEntity(item, count, { position });
        this.items.push(entity);
        return entity;
    }

    /** Sets a block and, optionally, its tags. */
    public setBlock(pos: BlockPos, block: string, tags: readonly string[] = []): void {
        this.blocks.set(key(pos), block);
        this.blockTags.set(key(pos), new Set(tags));
    }

    /** Adds a point of interest with a free ticket. */
    public addPoi(pos: BlockPos, type: string): void {
        this.pois.push({ pos, type, hasSpace: true });
    }

    /** Advances the game time, and the time of day with it. */
    public advance(ticks = 1): void {
        this.time += ticks;
        this.dayTimeTicks = (this.dayTimeTicks + ticks) % 24000;
    }

    /** Ticks since the world was built, which {@link TestWorld.advance} moves. */
    public gameTime(): number {
        return this.time;
    }

    /** Time of day in ticks, wrapped at 24000. */
    public dayTime(): number {
        return this.dayTimeTicks;
    }

    /** The next scripted draw. The last value repeats once the script runs out. */
    public random(): number {
        const value = this.randomValues[Math.min(this.randomIndex, this.randomValues.length - 1)] ?? 0;
        this.randomIndex++;
        return value;
    }

    /** The next scripted draw scaled into `[0, bound)`, and 0 when the bound is not positive. */
    public randomInt(bound: number): number {
        return bound <= 0 ? 0 : Math.floor(this.random() * bound);
    }

    /** Every non-item entity within the radius, minus the excluded one. Items are tracked separately. */
    public livingEntitiesNear(center: Vec3, radius: number, exclude: BrainEntity): readonly BrainEntity[] {
        return this.entities.filter(
            (entity) =>
                entity.id !== exclude.id &&
                entity.type !== 'minecraft:item' &&
                distanceSquared(entity.position, center) <= radius * radius
        );
    }

    /** Every entity a test spawned as `minecraft:player`, at any distance. */
    public players(): readonly BrainEntity[] {
        return this.entities.filter((entity) => entity.type === 'minecraft:player');
    }

    /** Item entities inside the box, which is how Java bounds an item search rather than by radius. */
    public itemEntitiesNear(center: Vec3, xzRange: number, yRange: number): readonly BrainItemEntity[] {
        return this.items.filter(
            (item) =>
                Math.abs(item.position.x - center.x) <= xzRange &&
                Math.abs(item.position.z - center.z) <= xzRange &&
                Math.abs(item.position.y - center.y) <= yRange
        );
    }

    /** Defers to the line-of-sight predicate a test passed in, which is true for everything by default. */
    public canSee(body: BrainEntity, target: BrainEntity): boolean {
        return this.lineOfSight(body, target);
    }

    /** True for a living, non-spectator target the body can see. */
    public isTargetable(body: BrainEntity, target: BrainEntity): boolean {
        return target.alive && !target.spectator && this.canSee(body, target);
    }

    /** Targetable, and allowed by the attackable predicate a test passed in. */
    public isAttackable(body: BrainEntity, target: BrainEntity): boolean {
        return this.isTargetable(body, target) && target.canBeTargeted?.() !== false && this.attackable(body, target);
    }

    /** Compares the straight-line distance against the melee range a test set. */
    public isWithinMeleeRange(body: BrainEntity, target: BrainEntity): boolean {
        return distanceSquared(body.position, target.position) <= this.meleeRange * this.meleeRange;
    }

    /** The block a test placed at the position, or `minecraft:air`. */
    public blockAt(pos: BlockPos): string {
        return this.blocks.get(key(pos)) ?? 'minecraft:air';
    }

    /** The tags a test placed at the position, or an empty set. */
    public blockTagsAt(pos: BlockPos): ReadonlySet<string> {
        return this.blockTags.get(key(pos)) ?? new Set();
    }

    /** The matching block nearest the center by Manhattan distance, searched over the box a test filled. */
    public findBlock(
        center: BlockPos,
        xzRange: number,
        yRange: number,
        test: (block: string, tags: ReadonlySet<string>) => boolean
    ): BlockPos | undefined {
        const found: BlockPos[] = [];
        for (const [coords, block] of this.blocks) {
            const pos = parseKey(coords);
            if (
                Math.abs(pos.x - center.x) > xzRange ||
                Math.abs(pos.z - center.z) > xzRange ||
                Math.abs(pos.y - center.y) > yRange
            ) {
                continue;
            }
            if (test(block, this.blockTagsAt(pos))) {
                found.push(pos);
            }
        }
        found.sort(
            (a, b) =>
                Math.abs(a.x - center.x) +
                Math.abs(a.y - center.y) +
                Math.abs(a.z - center.z) -
                (Math.abs(b.x - center.x) + Math.abs(b.y - center.y) + Math.abs(b.z - center.z))
        );
        return found[0];
    }

    /** The position a test parked in `nextRandomPos`, so a wander target is a fact of the test. */
    public randomPos(_body: BrainEntity, _request: RandomPosRequest): Vec3 | undefined {
        return this.nextRandomPos;
    }

    /** Matching points of interest inside the box, nearest first by horizontal distance. */
    public pointsOfInterest(center: BlockPos, radius: number, type: (type: string) => boolean): readonly PoiRecord[] {
        return this.pois
            .filter(
                (poi) =>
                    type(poi.type) &&
                    Math.abs(poi.pos.x - center.x) <= radius &&
                    Math.abs(poi.pos.y - center.y) <= radius &&
                    Math.abs(poi.pos.z - center.z) <= radius
            )
            .sort(
                (a, b) =>
                    Math.abs(a.pos.x - center.x) +
                    Math.abs(a.pos.z - center.z) -
                    (Math.abs(b.pos.x - center.x) + Math.abs(b.pos.z - center.z))
            );
    }

    /** Takes the ticket at the position, and reports false when there is no record or no space left. */
    public claimPoi(pos: BlockPos, claimant: BrainEntity): boolean {
        const poi = this.pois.find((candidate) => key(candidate.pos) === key(pos));
        if (poi === undefined || !poi.hasSpace) {
            return false;
        }
        const index = this.pois.indexOf(poi);
        this.pois[index] = { ...poi, hasSpace: false, claimedBy: claimant.id };
        return true;
    }

    /** Frees the ticket at the position. Releasing an unknown position does nothing. */
    public releasePoi(pos: BlockPos, _claimant: BrainEntity): void {
        const poi = this.pois.find((candidate) => key(candidate.pos) === key(pos));
        if (poi === undefined) {
            return;
        }
        this.pois[this.pois.indexOf(poi)] = { pos: poi.pos, type: poi.type, hasSpace: true };
    }

    /** Records the sound and where it played in `sounds`. */
    public playSound(sound: string, pos: Vec3): void {
        this.sounds.push({ sound, pos });
    }

    /** Records the vibration in `gameEvents`, which is what the warden's sensor reads in a test. */
    public emitGameEvent(event: string, pos: Vec3, source?: BrainEntity): void {
        this.gameEvents.push({ event, pos, source });
    }
}

function key(pos: BlockPos): string {
    return `${pos.x},${pos.y},${pos.z}`;
}

function parseKey(coords: string): BlockPos {
    const [x, y, z] = coords.split(',').map(Number);
    return { x: x ?? 0, y: y ?? 0, z: z ?? 0 };
}
