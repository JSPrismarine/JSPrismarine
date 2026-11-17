/**
 * The world seam: what the script host reads and writes of the world its scripts run in.
 *
 * The server implements {@link ScriptWorld} for each world that runs scripts, and the host never
 * imports a world class ([ADR 0020](../../../../docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md)).
 * Everything crossing it is plain data: ids, strings and numbers
 * ([ADR 0011](../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)). Reads go through
 * getters and writes through the world's own setters. A before-event is a guard the host
 * registers in an action's guard stage ([ADR 0013](../../../../docs/adr/0013-vetoable-actions-are-staged.md)),
 * and an after-event is a change the world committed, which the host takes in the script flush
 * at the end of the tick.
 */

/** The weather as the Script API's `WeatherType` names it. */
export type ScriptWeather = 'Clear' | 'Rain' | 'Thunder';

/** A weather change a script's before-event sees before the world commits it. */
export interface WeatherChangeIntent {
    /** The dimension, as Bedrock names it, such as `minecraft:overworld`. */
    readonly dimension: string;
    readonly previousWeather: ScriptWeather;
    readonly newWeather: ScriptWeather;
    /** How long the new weather lasts, in ticks. */
    readonly duration: number;
}

/** A line of chat a player typed, which a script's before-event sees before anyone gets it. */
export interface ChatSendIntent {
    /** The id of the player who typed it, as {@link ScriptWorld.players} lists it. */
    readonly sender: string;
    readonly message: string;
}

/**
 * What a guard decides: let the action go on, with the intent it may have replaced, or veto it.
 */
export type GuardVerdict<Intent> = { readonly veto: true } | { readonly veto: false; readonly intent: Intent };

/** A guard in an action's guard stage. It reads the intent and writes nothing. */
export type Guard<Intent> = (intent: Intent) => GuardVerdict<Intent>;

/** What a guard of an action no script may change decides: veto it, or let it go on as it is. */
export interface VetoVerdict {
    readonly veto: boolean;
    /** A guard that can only veto hands back no intent. */
    readonly intent?: never;
}

/** A guard that can veto an action but not change it. */
export type VetoGuard<Intent> = (intent: Intent) => VetoVerdict;

/** A change the world committed, for an after-event. */
export type ScriptWorldEvent = { readonly type: 'weatherChange' } & Omit<WeatherChangeIntent, 'duration'>;

/** A client's answer to a form, which reaches the scripts as an input of the tick it arrived in. */
export interface ScriptFormResponse {
    /** The id of the player who answered, as {@link ScriptWorld.players} lists it. */
    readonly player: string;
    /** The id the form was sent with. */
    readonly formId: number;
    /** The JSON text the client sent, or null when it sent none. */
    readonly response: string | null;
    /** The cancel reason byte the client sent, or null when it sent none. */
    readonly cancelReason: number | null;
}

/** How the scripts' forms reach the world's players, and their answers come back. */
export interface ScriptFormChannel {
    /** Sends a player a form: a `ModalFormRequestPacket` with the id and the JSON as they are. */
    show(player: string, formId: number, json: string): void;
    /** Closes every form a player has open: a `ClientboundCloseFormPacket`. */
    closeAll(player: string): void;
    /** The answers the input step admitted since the last call, in the order they arrived. */
    takeResponses(): readonly ScriptFormResponse[];
}

/** What the script host reads and writes of one world. */
export interface ScriptWorld {
    /** The world's dimensions, as Bedrock names them, such as `minecraft:overworld`. */
    dimensions(): readonly string[];
    /** The ids of the players in the world, in the order they joined. */
    players(): readonly string[];
    /** Puts a line of chat on the screen of every player in the world. */
    sendMessage(message: string): void;
    /** The weather of a dimension now. */
    weather(dimension: string): ScriptWeather;
    /**
     * Changes a dimension's weather through the world's weather action: its guards run, and a
     * change they let through is committed and taken as a `weatherChange` event later.
     * @param duration - How long, in ticks.
     */
    setWeather(dimension: string, weather: ScriptWeather, duration: number): void;
    /**
     * Adds a guard to the weather action's guard stage.
     * @returns A function that removes it.
     */
    guardWeather(guard: Guard<WeatherChangeIntent>): () => void;
    /**
     * Adds a guard to the chat action of the world's players, which runs before any other
     * player, the console or a plugin gets the line. A veto drops the line. The guard cannot
     * change the line: `ChatSendBeforeEvent.message` is read-only in the Script API.
     * @returns A function that removes it.
     */
    guardChat(guard: VetoGuard<ChatSendIntent>): () => void;
    /** The changes the world committed since the last call, in the order it committed them. */
    takeEvents(): readonly ScriptWorldEvent[];
    /**
     * The wall clock as the input step admitted it for the current tick, in milliseconds since
     * the epoch. `Date` reads this rather than the host's clock, so a replay sees the same dates
     * ([ADR 0021](../../../../docs/adr/0021-the-script-watchdog-counts-steps.md)).
     */
    clock(): number;
    /** The channel `@minecraft/server-ui` forms travel over. A world without one sends no form. */
    readonly forms?: ScriptFormChannel;
}
