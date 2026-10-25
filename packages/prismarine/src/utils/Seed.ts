/** The largest and smallest values a Java `long` holds, which is the range a world seed has. */
const LONG_MAX = 2n ** 63n - 1n;
const LONG_MIN = -(2n ** 63n);

/** What `Long.parseLong` accepts: an optional sign, then decimal digits and nothing else. */
const DECIMAL_LONG = /^[+-]?\d+$/;

/**
 * The seed a world with nothing configured runs on.
 *
 * Also what an empty or absent config value reads as, so a world whose seed was never written
 * down generates the same terrain every time it starts rather than a new world per restart.
 */
const DEFAULT_SEED = 0n;

/**
 * Java's `String.hashCode`, which is how Java turns a seed that is not a number into one.
 *
 * `s[0]*31^(n-1) + s[1]*31^(n-2) + ... + s[n-1]`, over UTF-16 code units and in 32-bit signed
 * arithmetic. `Math.imul` is what keeps the multiply 32-bit; the `| 0` keeps the sum there.
 *
 * @param text - The seed as the player typed it.
 * @returns The hash, sign-extended to 64 bits the way Java's `(long) text.hashCode()` is.
 */
const javaStringHash = (text: string): bigint => {
    let hash = 0;
    for (let index = 0; index < text.length; index++) {
        hash = (Math.imul(31, hash) + text.charCodeAt(index)) | 0;
    }

    return BigInt(hash);
};

/**
 * A fresh world seed, drawn over the whole 64-bit range Java draws one over.
 *
 * Two 32-bit halves rather than one `Math.random`, which only has 53 bits to give and would
 * leave the top of the range unreachable.
 *
 * @returns A random signed 64-bit seed.
 */
export const SeedGenerator = (): bigint => {
    const half = () => BigInt(Math.floor(Math.random() * 0x1_0000_0000));
    return BigInt.asIntN(64, (half() << 32n) | half());
};

/**
 * The seed a configured value means, by Java's rule for the text in its world creation box.
 *
 * Text that parses as a `long` is that number; anything else is its `String.hashCode`. That is
 * what lets a player paste a named Java seed and land in Java's world, and it is why the config
 * value is read as a string: neither JSON nor YAML can hold a 19-digit seed as a number literal
 * without rounding it, and the rounded seed generates a different world.
 *
 * A number is still accepted, for configs written before the seed was a string. One above
 * 2^53 has already lost bits by the time it is parsed, and nothing here can recover them.
 *
 * @param configured - The `seed` value from the world's config entry.
 * @returns The seed as a signed 64-bit value, or 0 when nothing is configured.
 */
export const worldSeedOf = (configured: string | number | undefined): bigint => {
    if (configured === undefined) return DEFAULT_SEED;
    if (typeof configured === 'number') {
        return Number.isFinite(configured) ? BigInt.asIntN(64, BigInt(Math.trunc(configured))) : DEFAULT_SEED;
    }

    const text = configured.trim();
    if (text.length === 0) return DEFAULT_SEED;

    if (DECIMAL_LONG.test(text)) {
        const parsed = BigInt(text);
        // Out of a `long`'s range is where `Long.parseLong` throws and Java falls back to the
        // hash, so a 25-digit seed is a name rather than a number there too.
        if (parsed >= LONG_MIN && parsed <= LONG_MAX) return parsed;
    }

    return javaStringHash(text);
};
