/*
 * Java's Xoroshiro128++ as packages/worldgen/src/random/XoroshiroRandomSource.ts runs it, and its
 * positional factory: Mth.getSeed of a block position xored into the factory's low half.
 */
#ifndef JSP_XOROSHIRO_H
#define JSP_XOROSHIRO_H

#include <stdint.h>

/* Xoroshiro128++ as XoroshiroRandomSource runs it, from a positional seed. */
typedef struct {
    uint64_t lo, hi;
} Xoroshiro;

static inline uint64_t rotl(uint64_t value, int shift) { return (value << shift) | (value >> (64 - shift)); }

static inline uint64_t xoroshiro_next(Xoroshiro *r) {
    const uint64_t s0 = r->lo;
    uint64_t s1 = r->hi;
    const uint64_t result = rotl(s0 + s1, 17) + s0;
    s1 ^= s0;
    r->lo = rotl(s0, 49) ^ s1 ^ (s1 << 21);
    r->hi = rotl(s1, 28);
    return result;
}

/* Java's Xoroshiro nextInt(bound): Lemire's method over the low 32 bits of each output. */
static inline int32_t xoroshiro_next_int(Xoroshiro *r, uint32_t bound) {
    uint64_t product = (uint64_t)(uint32_t)xoroshiro_next(r) * bound;
    if ((uint32_t)product < bound) {
        const uint32_t threshold = (uint32_t)(-bound) % bound;
        while ((uint32_t)product < threshold) product = (uint64_t)(uint32_t)xoroshiro_next(r) * bound;
    }
    return (int32_t)(product >> 32);
}

/* Java's Mth.getSeed, which the positional factory xors into its low half. */
static inline uint64_t position_seed(int32_t x, int32_t y, int32_t z) {
    const int64_t x_term = (int64_t)(int32_t)((uint32_t)x * 3129871u);
    uint64_t seed = (uint64_t)x_term ^ ((uint64_t)(int64_t)z * 116129781ull) ^ (uint64_t)(int64_t)y;
    seed = seed * seed * 42317861ull + seed * 11ull;
    return (uint64_t)((int64_t)seed >> 16);
}

/* XoroshiroPositionalRandomFactory.at: the factory's seed with a position's hash in its low half. */
static inline Xoroshiro xoroshiro_at(uint64_t seed_lo, uint64_t seed_hi, int32_t x, int32_t y, int32_t z) {
    Xoroshiro r = {position_seed(x, y, z) ^ seed_lo, seed_hi};
    /* An all-zero state is a fixed point; Java substitutes the golden and silver ratios. */
    if (r.lo == 0 && r.hi == 0) {
        r.lo = 0x9E3779B97F4A7C15ull;
        r.hi = 0x6A09E667F3BCC909ull;
    }
    return r;
}

/* XoroshiroRandomSource.nextFloat: the top 24 bits of the next output, times 2^-24. */
static inline double xoroshiro_next_float(Xoroshiro *r) {
    return (double)(float)((double)(uint32_t)(xoroshiro_next(r) >> 40) * 5.9604644775390625e-8);
}

/*
 * LegacyRandomSource.nextFloat of LegacyPositionalRandomFactory.at: java.util.Random seeded with a
 * position's hash xored into the factory's seed, then one 24-bit draw.
 */
static inline double legacy_first_float(uint64_t factory_seed, int32_t x, int32_t y, int32_t z) {
    const uint64_t mask = (1ull << 48) - 1;
    uint64_t seed = ((position_seed(x, y, z) ^ factory_seed) ^ 0x5DEECE66Dull) & mask;
    seed = (seed * 0x5DEECE66Dull + 0xBull) & mask;
    return (double)(float)((double)(uint32_t)(seed >> 24) * 5.9604644775390625e-8);
}

#endif
