/**
 * The pieces every command definition needs: resolving coordinates against
 * the source, turning a selector into entities, and the enums Mojang's own
 * metadata spells for the shared commands.
 */
import type {
    ArgumentType,
    CommandContext,
    LiteralArgumentBuilder,
    RequiredArgumentBuilder
} from '@jsprismarine/brigadier';
import { CommandSyntaxException, argument, literal } from '@jsprismarine/brigadier';

import type { BedrockDescribedType, Coordinate, CoordinateTriple, ScoreHolderModel } from '../argumentTypes';
import { enumArgument, stringArgument } from '../argumentTypes';
import type { CommandSource, EntityRef, Rotation, Vector3 } from '../host';
import type { SelectorModel } from '../selector';
import { suggestFromData } from '../suggestions';

/** The command result Brigadier treats as "did nothing". */
export const FAILED = 0;

/** The command result a success with nothing to count reports. */
export const SUCCESS = 1;

const refuse: (message: string) => never = (message) => {
    throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherParseException().create(message);
};

const DEGREES = Math.PI / 180;

/** The unit vectors of the source's facing, for a `^` local coordinate. */
const basisOf = ({ yaw, pitch }: Rotation) => {
    const yawRadians = yaw * DEGREES;
    const pitchRadians = pitch * DEGREES;
    const forward = {
        x: -Math.sin(yawRadians) * Math.cos(pitchRadians),
        y: -Math.sin(pitchRadians),
        z: Math.cos(yawRadians) * Math.cos(pitchRadians)
    };
    const left = { x: Math.cos(yawRadians), y: 0, z: Math.sin(yawRadians) };
    const up = {
        x: left.y * forward.z - left.z * forward.y,
        y: left.z * forward.x - left.x * forward.z,
        z: left.x * forward.y - left.y * forward.x
    };
    return { forward, left, up };
};

/**
 * Turns a parsed coordinate triple into an absolute position.
 *
 * `~` is relative to the source's position and `^` is local to its facing,
 * measured left, up and forward in that order, which is Java's order.
 *
 * @throws {CommandSyntaxException} When `^` and the other two forms are mixed,
 *   which Java also refuses.
 */
export const resolvePosition = (triple: CoordinateTriple, source: CommandSource): Vector3 => {
    const locals = triple.filter((coordinate) => coordinate.mode === 'local').length;
    if (locals !== 0 && locals !== 3) {
        refuse('Cannot mix world and local coordinates');
    }

    const [x, y, z] = triple;
    if (locals === 3) {
        const { forward, left, up } = basisOf(source.rotation);
        return {
            x: source.position.x + left.x * x.value + up.x * y.value + forward.x * z.value,
            y: source.position.y + left.y * x.value + up.y * y.value + forward.y * z.value,
            z: source.position.z + left.z * x.value + up.z * y.value + forward.z * z.value
        };
    }

    const axis = (coordinate: Coordinate, base: number) =>
        coordinate.mode === 'relative' ? base + coordinate.value : coordinate.value;
    return {
        x: axis(x, source.position.x),
        y: axis(y, source.position.y),
        z: axis(z, source.position.z)
    };
};

/** Turns a yaw and a pitch, either of which may be relative, into a rotation. */
export const resolveRotation = (yaw: Coordinate, pitch: Coordinate, source: CommandSource): Rotation => ({
    yaw: yaw.mode === 'relative' ? source.rotation.yaw + yaw.value : yaw.value,
    pitch: pitch.mode === 'relative' ? source.rotation.pitch + pitch.value : pitch.value
});

/** Resolves a selector against the world through the host. */
export const select = (source: CommandSource, selector: SelectorModel): readonly EntityRef[] =>
    source.host.entities.select(selector, source);

/**
 * Resolves a selector that must match exactly one entity.
 *
 * @throws {CommandSyntaxException} When the selector matched none or several,
 *   which is what Java's `entity(single)` argument does.
 */
export const selectOne = (source: CommandSource, selector: SelectorModel): EntityRef => {
    const matches = select(source, selector);
    if (matches.length === 0) refuse('No entity was found');
    if (matches.length > 1) refuse('Only one entity is allowed, but the selector found more than one');
    return matches[0]!;
};

/**
 * Resolves a score holder to the names the scoreboard keys on.
 *
 * A selector resolves to the names of the entities it matched, a bare name is
 * itself, and `*` is every holder the scoreboard already tracks - which is
 * what makes `/scoreboard players reset *` the command that clears the board.
 */
export const scoreHolders = (source: CommandSource, holder: ScoreHolderModel): readonly string[] => {
    if (holder.kind === 'name') return [holder.name];
    if (holder.kind === 'all') return source.host.scoreboard.holders();
    return select(source, holder.selector).map((entity) => entity.name);
};

/**
 * Resolves a score holder that must name exactly one.
 *
 * @throws {CommandSyntaxException} When it named none or several, which is
 *   what Java's single-holder form does.
 */
export const scoreHolderOne = (source: CommandSource, holder: ScoreHolderModel): string => {
    const names = scoreHolders(source, holder);
    if (names.length === 0) refuse('No score holder was found');
    if (names.length > 1) refuse('Only one score holder is allowed, but more than one was named');
    return names[0]!;
};

/** A Brigadier context over this package's source type. */
export type Context = CommandContext<CommandSource>;

/** `literal`, with the source type already bound. */
export const lit = (name: string): LiteralArgumentBuilder<CommandSource> => literal<CommandSource>(name);

/** `argument`, with the source type already bound. */
export const arg = <T>(name: string, type: ArgumentType<T>): RequiredArgumentBuilder<CommandSource, T> =>
    argument<CommandSource, T>(name, type);

/**
 * Reads a parsed argument.
 *
 * The port's `CommandContext.getArgument` is untyped, so the type a command
 * expects is named at the call site instead.
 */
export const value = <T>(context: Context, name: string): T => context.getArgument(name);

/** Reads the source out of a Brigadier context. */
export const source = (context: Context): CommandSource => context.getSource();

/** The port's `Command<S>` type, which its index does not re-export. */
type CommandExecutor = Parameters<LiteralArgumentBuilder<CommandSource>['executes']>[0];

/**
 * Wraps a command body for `ArgumentBuilder.executes`.
 *
 * The port declares `Command<S>` as `(context) => Promise<any>`, where
 * upstream Brigadier returns an `int` and `CommandDispatcher.execute` reads
 * the value synchronously and hands it to the `ResultConsumer`. A number is
 * what the dispatcher wants and what `execute store result` captures, so the
 * declared type is bridged here once instead of at every command.
 */
export const command = (run: (context: CommandContext<CommandSource>) => number): CommandExecutor =>
    run as unknown as CommandExecutor;

/**
 * Reports a count back to the source and returns it as the command result.
 *
 * A command's return value is what `execute store result` captures, so it has
 * to be the count rather than a plain success flag.
 */
export const report = (source: CommandSource, count: number, message: string): number => {
    if (count > 0) source.sendFeedback(message);
    else source.sendError(message);
    return count;
};

/** The Bedrock spellings of the three vanilla dimensions, which is what the client's `Dimension` enum holds. */
const BEDROCK_DIMENSIONS = ['overworld', 'nether', 'the_end'] as const;

/**
 * A dimension name, for `/execute in` and `execute if dimension`.
 *
 * Any token parses, since dimensions are data-driven and a custom one is only known to the
 * host. {@link toDimensionId} turns the token into a Java id and {@link dimensionSuggestions}
 * offers the host's `dimensions()`. The client's `Dimension` enum holds only the vanilla three.
 */
export const dimensionArgument = (): BedrockDescribedType<string> => ({
    parse: stringArgument().parse,
    describeBedrock: () => ({ kind: 'enum', name: 'Dimension', values: BEDROCK_DIMENSIONS })
});

/** Suggests the dimensions the host has, Java ids included. */
export const dimensionSuggestions = suggestFromData<CommandSource>((context) =>
    context.getSource().host.world.dimensions()
);

/** The five game modes `/gamemode` accepts, in Mojang's Bedrock spelling. */
export const gameModeArgument = () =>
    enumArgument('GameMode', ['survival', 'creative', 'adventure', 'spectator', 'default'] as const);

/** The two anchors `execute anchored` and `execute facing entity` accept. */
export const anchorArgument = () => enumArgument('ActorLocation', ['eyes', 'feet'] as const);

/**
 * The Java dimension id a dimension argument names.
 *
 * A namespaced id, `minecraft:the_nether` or `mypack:skylands`, is taken as it is. A bare name
 * is given the `minecraft:` namespace, and Bedrock's `nether` becomes Java's `the_nether`.
 */
export const toDimensionId = (name: string): string => {
    if (name.includes(':')) return name;
    return `minecraft:${name === 'nether' ? 'the_nether' : name}`;
};
