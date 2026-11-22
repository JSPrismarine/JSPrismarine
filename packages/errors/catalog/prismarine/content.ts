import { defineErrors } from '../defineErrors';

/** The errors the content code of `@jsprismarine/prismarine` throws. */
export const PrismarineContentErrors = defineErrors('prismarine/content', {
    /**
     * The random source the server was configured with cannot save its state, so replays cannot
     * restore it. Use the default random source to record replays.
     */
    ConfiguredRandomNotRestorable: 'The configured content random source cannot be restored for replay',
    /**
     * One of the content's random sources cannot restore a saved state, so the replay cannot be
     * reproduced. This is a bug in the server; report it with the stack trace.
     */
    RandomSourceNotRestorable: 'The {key} content random source cannot be restored for replay',
    /**
     * One of the content's random sources cannot save its state, so the session cannot be recorded
     * for replay. This is a bug in the server; report it with the stack trace.
     */
    RandomSourceNotSavable: 'The {key} content random source cannot be saved for replay',
    /**
     * `content-java-version` in `config.json` names a Java release that `sources.json` in
     * `@jsprismarine/bedrock-data` does not pin. Set it to one of the pinned releases the message
     * lists, or clear it to run the default release.
     */
    UnknownJavaRelease:
        'content-java-version names Java {release}, which is not pinned; the pinned releases are {pinned}',
    /**
     * `content-java-version` names a pinned Java release whose vanilla datapack, or the
     * `version.json` beside it, is not in the download cache. Generate it with the command the
     * message gives, or set `content-java-version` to a release that is generated.
     */
    JavaReleaseNotGenerated:
        'the Java {release} vanilla datapack is not generated at {path}; run `pnpm --filter @jsprismarine/bedrock-data run datagen:java --java {release}` (pinned releases: {pinned})',
    /**
     * Game content reached into the world before the content finished building. This is a bug in
     * the server; report it with the stack trace.
     */
    ContentWorldReadDuringBuild: 'the content world was read before the content finished building',
    /**
     * A saved content random state does not have the shape the server writes, so the save or the
     * replay that holds it is damaged.
     */
    InvalidContentRandomStateEntry: { message: 'Invalid content random state entry', base: TypeError },
    /**
     * The saved content random states do not have the shape the server writes, so the save or the
     * replay that holds it is damaged.
     */
    InvalidContentRandomStates: { message: 'Invalid content random states', base: TypeError },
    /** Code asked for a game rule the Java registry does not have, such as a misspelled name. */
    UnknownGameRule: '{name} is not a game rule of the 26.3 registry',
    /**
     * The `minecraft:flammable` component's schema refused its own defaults. This is a bug in the
     * server; report it with the stack trace.
     */
    FlammableDefaultsRejected: 'the minecraft:flammable schema rejected its own defaults',
    /** Game content tried to act in a dimension that has no loaded world. */
    NoWorldToPlayIn: 'no {dimension} world is loaded, so nothing can be played in it',
    /**
     * A replay was saved without some of the content's random streams, so it came from a different
     * version or set of packs.
     */
    ReplayMissingRandomStreams: 'Replay state has no content random stream for: {missing}',
    /**
     * Part of the world the content reads was replaced by something that is not an object. This is
     * a bug in the server; report it with the stack trace.
     */
    WorldSourceMemberReplaced: {
        message: 'World source member {property} changed from an object',
        base: TypeError
    },
    /**
     * Game content called part of the world the server has not implemented yet. The message names
     * the part and the subsystem that will provide it.
     */
    NotWired: '{member} is not wired yet; the {area} subsystem owns it',
    /**
     * A strict content build found Java identifiers in the loaded packs with no Bedrock equivalent
     * and no reviewed loss entry. The error's `unmapped` lists every one; map them, or record why
     * they are left out.
     */
    UnmappedJavaIdentifiers:
        'the pack stack references {count} Java identifier(s) with no Bedrock mapping and no reviewed loss entry, first: {id} ({registry}) in pack "{pack}" at {path}'
});
