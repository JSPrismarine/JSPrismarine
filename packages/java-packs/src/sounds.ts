/**
 * Bedrock's `sounds/sound_definitions.json`, which becomes a Java `sounds.json`. The events keep
 * their Bedrock names, made into Java paths, under the converted namespace.
 */
import { isRecord } from './isRecord';
import { BEDROCK_NAMESPACE, javaPath } from './resourceLocation';

/** One sound file a Java event plays, as `sounds.json` writes it. */
export interface JavaSound {
    /** The file, `bedrock:<path>`, under `assets/bedrock/sounds/` without `.ogg`. */
    readonly name: string;
    readonly volume?: number;
    readonly pitch?: number;
    readonly weight?: number;
    readonly stream?: boolean;
    readonly attenuation_distance?: number;
}

/** One Java sound event. */
export interface JavaSoundEvent {
    readonly sounds: readonly JavaSound[];
}

/** A Bedrock sound file a definition names, and the Java file name it plays as. */
export interface SoundFile {
    /** The Bedrock path without an extension, such as `sounds/mob/cow/say1`. */
    readonly bedrock: string;
    /** The path under `assets/bedrock/sounds/`, without `.ogg`. */
    readonly java: string;
}

/** What one definition file gives: its events, the files they play, and what it left out. */
export interface ConvertedSoundDefinitions {
    /** By Java event path, which is also its name under the converted namespace. */
    readonly events: ReadonlyMap<string, JavaSoundEvent>;
    readonly files: readonly SoundFile[];
    /** Fields Java has no counterpart for, by event, such as `min_distance`. */
    readonly lossy: readonly string[];
}

/** The Java sound file a Bedrock path plays as: `sounds/mob/cow/say1` is `mob/cow/say1`. */
export const javaSoundPath = (bedrock: string): string => javaPath(bedrock.replace(/^sounds\//, ''));

const numberOf = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

/**
 * Reads a decoded `sound_definitions.json`, the current shape with `sound_definitions` inside or
 * the older one of events at its root. A sound entry is a path or an object with `name`, `volume`,
 * `pitch`, `weight`, `stream` and `is3D`; an event's `max_distance` becomes each of its sounds'
 * `attenuation_distance`, Java's one distance, and `min_distance` and `category` are dropped.
 */
export const convertSoundDefinitions = (value: unknown): ConvertedSoundDefinitions => {
    const events = new Map<string, JavaSoundEvent>();
    const files = new Map<string, SoundFile>();
    const lossy: string[] = [];
    const root = isRecord(value) && isRecord(value.sound_definitions) ? value.sound_definitions : value;
    if (!isRecord(root)) return { events, files: [], lossy };
    for (const [name, definition] of Object.entries(root)) {
        if (name === 'format_version' || !isRecord(definition) || !Array.isArray(definition.sounds)) continue;
        const distance = numberOf(definition.max_distance);
        if (numberOf(definition.min_distance) !== undefined || typeof definition.category === 'string')
            lossy.push(name);
        const sounds: JavaSound[] = [];
        for (const entry of definition.sounds) {
            const sound = typeof entry === 'string' ? { name: entry } : isRecord(entry) ? entry : undefined;
            if (sound === undefined || typeof sound.name !== 'string' || sound.name === '') continue;
            const java = javaSoundPath(sound.name);
            files.set(sound.name, { bedrock: sound.name, java });
            const volume = numberOf(sound.volume);
            const pitch = numberOf(sound.pitch);
            const weight = numberOf(sound.weight);
            sounds.push({
                name: `${BEDROCK_NAMESPACE}:${java}`,
                ...(volume === undefined ? {} : { volume }),
                ...(pitch === undefined ? {} : { pitch }),
                ...(weight === undefined ? {} : { weight: Math.max(1, Math.round(weight)) }),
                ...(sound.stream === true ? { stream: true } : {}),
                ...(distance === undefined ? {} : { attenuation_distance: Math.round(distance) })
            });
        }
        if (sounds.length > 0) events.set(javaPath(name), { sounds });
    }
    return { events, files: [...files.values()], lossy };
};
