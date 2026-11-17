/**
 * Writes the `level.dat` a staged world starts from, for a capture that needs a world setting
 * `server.properties` has no key for, such as an experiment.
 *
 * Bedrock Dedicated Server reads a `level.dat` that holds only these tags and fills in the rest,
 * as a run of the `scripting` captures with the Beta APIs experiment showed. The dialect is the
 * one `reader.ts` reads: an 8 byte header, the storage version and the payload's length, then a
 * little endian NBT compound with fixed width numbers.
 */

/** The storage version every modern release writes. */
const STORAGE_VERSION = 10;

const TAG_BYTE = 1;
const TAG_INT = 3;
const TAG_COMPOUND = 10;

/** What the staged world's `level.dat` says. */
export interface LevelDatSettings {
    /** The experiment toggles to turn on, by their `level.dat` names, such as `gametest`. */
    readonly experiments: readonly string[];
    /** The `Generator`: 1 for infinite, 2 for flat. */
    readonly generator: number;
}

const name = (text: string): Buffer => {
    const bytes = Buffer.from(text, 'utf8');
    const length = Buffer.alloc(2);
    length.writeUInt16LE(bytes.byteLength);
    return Buffer.concat([length, bytes]);
};

const tag = (type: number, label: string, payload: Buffer): Buffer =>
    Buffer.concat([Buffer.from([type]), name(label), payload]);

const byte = (label: string, value: number): Buffer => tag(TAG_BYTE, label, Buffer.from([value]));

const int = (label: string, value: number): Buffer => {
    const payload = Buffer.alloc(4);
    payload.writeInt32LE(value);
    return tag(TAG_INT, label, payload);
};

const compound = (label: string, children: readonly Buffer[]): Buffer =>
    tag(TAG_COMPOUND, label, Buffer.concat([...children, Buffer.from([0])]));

/**
 * The bytes of a `level.dat` with the given experiments on, beside the two flags Bedrock sets
 * with the first experiment a world turns on.
 */
export const renderLevelDat = (settings: LevelDatSettings): Buffer => {
    const toggles =
        settings.experiments.length === 0
            ? []
            : [
                  compound('experiments', [
                      ...settings.experiments.map((experiment) => byte(experiment, 1)),
                      byte('experiments_ever_used', 1),
                      byte('saved_with_toggled_experiments', 1)
                  ])
              ];
    const body = compound('', [...toggles, int('Generator', settings.generator)]);
    const header = Buffer.alloc(8);
    header.writeInt32LE(STORAGE_VERSION, 0);
    header.writeInt32LE(body.byteLength, 4);
    return Buffer.concat([header, body]);
};
