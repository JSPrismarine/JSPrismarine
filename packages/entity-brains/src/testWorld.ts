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
        this.typeTags = new Set(options.typeTags ?? []);
        this.conditions = new Set(options.conditions ?? []);
        this.mainHandItem = options.mainHandItem;
        this.offHandItem = options.offHandItem;
        this.armorItems = [...(options.armorItems ?? [])];
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

    public moveTo(target: Vec3, speedModifier: number): boolean {
        if (!this.canReach(target)) {
            return false;
        }
        this.moves.push({ target, speedModifier });
        this.done = false;
        return true;
    }

    public isDone(): boolean {
        return this.done;
    }

    public isStuck(): boolean {
        return this.stuck;
    }

    public canReach(target: Vec3): boolean {
        return !this.unreachable.some((pos) => pos.x === target.x && pos.y === target.y && pos.z === target.z);
    }

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

    public setCondition(condition: string, value: boolean): void {
        if (value) {
            this.conditions.add(condition);
        } else {
            this.conditions.delete(condition);
        }
    }

    public lookAt(position: Vec3): void {
        this.looks.push(position);
    }

    public jump(): void {
        this.jumps++;
    }

    public attack(target: BrainEntity): void {
        this.attacks.push(target);
    }

    public playSound(sound: string): void {
        this.sounds.push(sound);
    }

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

    public gameTime(): number {
        return this.time;
    }

    public dayTime(): number {
        return this.dayTimeTicks;
    }

    public random(): number {
        const value = this.randomValues[Math.min(this.randomIndex, this.randomValues.length - 1)] ?? 0;
        this.randomIndex++;
        return value;
    }

    public randomInt(bound: number): number {
        return bound <= 0 ? 0 : Math.floor(this.random() * bound);
    }

    public livingEntitiesNear(center: Vec3, radius: number, exclude: BrainEntity): readonly BrainEntity[] {
        return this.entities.filter(
            (entity) =>
                entity.id !== exclude.id &&
                entity.type !== 'minecraft:item' &&
                distanceSquared(entity.position, center) <= radius * radius
        );
    }

    public players(): readonly BrainEntity[] {
        return this.entities.filter((entity) => entity.type === 'minecraft:player');
    }

    public itemEntitiesNear(center: Vec3, xzRange: number, yRange: number): readonly BrainItemEntity[] {
        return this.items.filter(
            (item) =>
                Math.abs(item.position.x - center.x) <= xzRange &&
                Math.abs(item.position.z - center.z) <= xzRange &&
                Math.abs(item.position.y - center.y) <= yRange
        );
    }

    public canSee(body: BrainEntity, target: BrainEntity): boolean {
        return this.lineOfSight(body, target);
    }

    public isTargetable(body: BrainEntity, target: BrainEntity): boolean {
        return target.alive && !target.spectator && this.canSee(body, target);
    }

    public isAttackable(body: BrainEntity, target: BrainEntity): boolean {
        return this.isTargetable(body, target) && this.attackable(body, target);
    }

    public isWithinMeleeRange(body: BrainEntity, target: BrainEntity): boolean {
        return distanceSquared(body.position, target.position) <= this.meleeRange * this.meleeRange;
    }

    public blockAt(pos: BlockPos): string {
        return this.blocks.get(key(pos)) ?? 'minecraft:air';
    }

    public blockTagsAt(pos: BlockPos): ReadonlySet<string> {
        return this.blockTags.get(key(pos)) ?? new Set();
    }

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

    public randomPos(_body: BrainEntity, _request: RandomPosRequest): Vec3 | undefined {
        return this.nextRandomPos;
    }

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

    public claimPoi(pos: BlockPos, claimant: BrainEntity): boolean {
        const poi = this.pois.find((candidate) => key(candidate.pos) === key(pos));
        if (poi === undefined || !poi.hasSpace) {
            return false;
        }
        const index = this.pois.indexOf(poi);
        this.pois[index] = { ...poi, hasSpace: false, claimedBy: claimant.id };
        return true;
    }

    public releasePoi(pos: BlockPos, _claimant: BrainEntity): void {
        const poi = this.pois.find((candidate) => key(candidate.pos) === key(pos));
        if (poi === undefined) {
            return;
        }
        this.pois[this.pois.indexOf(poi)] = { pos: poi.pos, type: poi.type, hasSpace: true };
    }

    public playSound(sound: string, pos: Vec3): void {
        this.sounds.push({ sound, pos });
    }

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
