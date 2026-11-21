/*
 * The surface pass of packages/worldgen/src/surface/SurfaceSystem.ts over a whole chunk: each
 * column walked from the top down as buildColumn walks it, and each solid block run through the
 * material rule program of surface/MaterialRuleProgram.ts. The biome of a block comes from its
 * jittered lookup as biome/BiomeManager.ts makes it, the ore veins from chunk/oreVein.ts. A block
 * that reaches a condition the C does not answer is handed back, with its counters, for the
 * TypeScript interpreter.
 */
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "jsp_native_worldgen.h"
#include "xoroshiro.h"

/* MaterialRuleProgram's opcodes. */
enum { OP_TEST = 0, OP_TEST_NOT = 1, OP_BLOCK = 2, OP_BANDLANDS = 3, OP_ORE_VEIN = 4, OP_END = 5 };
#define OP_WORDS 3

/* The column categories the walk reads. */
enum { BLOCK_AIR = 0, BLOCK_FLUID = 1, BLOCK_SOLID = 2 };

#define NO_WATER INT32_MIN
#define JITTER_SIDE 16
#define JITTER_HEIGHT 128
#define JITTER_SLOTS (JITTER_SIDE * JITTER_SIDE * JITTER_HEIGHT)

typedef struct {
    double values[JWG_SURFACE_CONDITION_DOUBLES];
} Condition;

typedef struct {
    double density, richness, gap;
    double raw_ore_chance;
    int32_t ore, raw_ore, filler;
    uint64_t seed_lo, seed_hi;
    int has_verdicts;
} Vein;

typedef struct {
    int32_t *ops;
    int32_t op_count;
    Condition *conditions;
    int32_t condition_count;
    uint32_t *biome_sets;
    int32_t biome_words;
    Vein *veins;
    int32_t vein_count;
    uint64_t zoom_hi, zoom_lo;
    /* Each lattice point's jitter, as BiomeManager.jitterAt caches it. */
    int32_t jitter_x[JITTER_SLOTS], jitter_y[JITTER_SLOTS], jitter_z[JITTER_SLOTS];
    double jitter[JITTER_SLOTS * 3];
    uint8_t jitter_filled[JITTER_SLOTS];
    /* Each condition's last answer, keyed by the block counter, or the column counter for a
       condition that reads the column alone. */
    int64_t *answered_at;
    uint8_t *answers;
    int64_t block_counter, column_counter;
} Surface;

/* What one chunk call reads; the fields its frame and buffers carry. */
typedef struct {
    int32_t chunk_x, chunk_z, min_y, height;
    int32_t biome_x0, biome_y0, biome_z0, biome_sx, biome_sy, biome_sz;
    int32_t cell_x0, cell_y0, cell_z0, cell_sx, cell_sy, cell_sz, cell_xz, cell_y;
    const int32_t *biomes;
    const uint8_t *verdicts;
    /* The block being run. */
    int32_t x, y, z, stone_above, stone_below, water_height;
    const double *column;
    int biome_known;
    int32_t biome;
    int fallback;
} Frame;

static inline int32_t floor_div(int32_t a, int32_t b) { return (int32_t)floor((double)a / b); }

/* BiomeManager.jitterAt: a lattice point's three jitter offsets, from the native jitter bits. */
static const double *jitter_at(Surface *s, int32_t x, int32_t y, int32_t z) {
    const int32_t slot = (x & (JITTER_SIDE - 1)) | ((z & (JITTER_SIDE - 1)) << 4) | ((y & (JITTER_HEIGHT - 1)) << 8);
    double *out = s->jitter + (size_t)slot * 3;
    if (s->jitter_filled[slot] && s->jitter_x[slot] == x && s->jitter_y[slot] == y && s->jitter_z[slot] == z) return out;
    const uint32_t bits = (uint32_t)jwg_biome_jitter((double)s->zoom_hi, (double)s->zoom_lo, x, y, z);
    out[0] = ((bits & 1023u) / 1024.0 - 0.5) * 0.9;
    out[1] = (((bits >> 10) & 1023u) / 1024.0 - 0.5) * 0.9;
    out[2] = (((bits >> 20) & 1023u) / 1024.0 - 0.5) * 0.9;
    s->jitter_filled[slot] = 1;
    s->jitter_x[slot] = x;
    s->jitter_y[slot] = y;
    s->jitter_z[slot] = z;
    return out;
}

/* BiomeManager.getBiome: the nearest of the eight cells around the block after the jitter. */
static int32_t biome_at(Surface *s, Frame *f) {
    const int32_t abs_x = f->x - 2, abs_y = f->y - 2, abs_z = f->z - 2;
    const int32_t px = abs_x >> 2, py = abs_y >> 2, pz = abs_z >> 2;
    const double fract_x = (abs_x & 3) / 4.0, fract_y = (abs_y & 3) / 4.0, fract_z = (abs_z & 3) / 4.0;
    int best_corner = 0;
    double best = INFINITY;
    for (int corner = 0; corner < 8; corner++) {
        const int x_even = (corner & 4) == 0, y_even = (corner & 2) == 0, z_even = (corner & 1) == 0;
        const double *j = jitter_at(s, x_even ? px : px + 1, y_even ? py : py + 1, z_even ? pz : pz + 1);
        const double dx = (x_even ? fract_x : fract_x - 1) + j[0];
        const double dy = (y_even ? fract_y : fract_y - 1) + j[1];
        const double dz = (z_even ? fract_z : fract_z - 1) + j[2];
        /* Java's grouping: (dz^2 + dy^2) + dx^2. */
        const double distance = dz * dz + dy * dy + dx * dx;
        if (best > distance) {
            best = distance;
            best_corner = corner;
        }
    }
    const int32_t qx = ((best_corner & 4) == 0 ? px : px + 1) - f->biome_x0;
    const int32_t qy = ((best_corner & 2) == 0 ? py : py + 1) - f->biome_y0;
    const int32_t qz = ((best_corner & 1) == 0 ? pz : pz + 1) - f->biome_z0;
    if (qx < 0 || qx >= f->biome_sx || qy < 0 || qy >= f->biome_sy || qz < 0 || qz >= f->biome_sz) {
        f->fallback = 1;
        return -1;
    }
    return f->biomes[((size_t)qx * f->biome_sz + qz) * f->biome_sy + qy];
}

static int condition_holds(Surface *s, Frame *f, const Condition *c) {
    const double *v = c->values;
    const double *column = f->column;
    const double surface_depth = column[JWG_SURFACE_COLUMN_DEPTH];
    switch ((int32_t)v[0]) {
        case JWG_SURFACE_BIOME: {
            if (!f->biome_known) {
                f->biome = biome_at(s, f);
                f->biome_known = 1;
            }
            if (f->fallback) return 0;
            const int32_t id = f->biome;
            if (id < 0 || id >= s->biome_words * 32) return 0;
            const uint32_t *set = s->biome_sets + (size_t)v[1];
            return (set[id >> 5] >> (id & 31)) & 1u;
        }
        case JWG_SURFACE_NOISE: {
            const double value = jwg_stack_get3(v[1], f->x, v[4] != 0 ? f->y : 0, f->z);
            return value >= v[2] && value <= v[3];
        }
        case JWG_SURFACE_VERTICAL_GRADIENT: {
            const double true_y = v[1], false_y = v[2];
            if (f->y <= true_y) return 1;
            if (f->y >= false_y) return 0;
            /* math.ts's map(y, trueAtAndBelow, falseAtAndAbove, 1, 0). */
            const double probability = 1 + ((f->y - true_y) / (false_y - true_y)) * (0 - 1);
            const uint64_t lo = ((uint64_t)(uint32_t)v[3] << 32) | (uint32_t)v[4];
            const uint64_t hi = ((uint64_t)(uint32_t)v[5] << 32) | (uint32_t)v[6];
            Xoroshiro r = xoroshiro_at(lo, hi, f->x, f->y, f->z);
            return xoroshiro_next_float(&r) < probability;
        }
        case JWG_SURFACE_VERTICAL_GRADIENT_LEGACY: {
            const double true_y = v[1], false_y = v[2];
            if (f->y <= true_y) return 1;
            if (f->y >= false_y) return 0;
            const double probability = 1 + ((f->y - true_y) / (false_y - true_y)) * (0 - 1);
            const uint64_t seed = ((uint64_t)(uint32_t)v[3] << 32) | (uint32_t)v[4];
            return legacy_first_float(seed, f->x, f->y, f->z) < probability;
        }
        case JWG_SURFACE_Y_ABOVE:
            return f->y + (v[3] != 0 ? f->stone_above : 0) >= v[1] + surface_depth * v[2];
        case JWG_SURFACE_WATER:
            return f->water_height == NO_WATER ||
                   f->y + (v[3] != 0 ? f->stone_above : 0) >= (double)f->water_height + v[1] + surface_depth * v[2];
        case JWG_SURFACE_STEEP:
            return column[JWG_SURFACE_COLUMN_GRADIENT_X] <= -4 || column[JWG_SURFACE_COLUMN_GRADIENT_Z] >= 4;
        case JWG_SURFACE_HOLE:
            return surface_depth <= 0;
        case JWG_SURFACE_ABOVE_PRELIMINARY_SURFACE:
            return f->y >= column[JWG_SURFACE_COLUMN_MIN_SURFACE_LEVEL];
        case JWG_SURFACE_STONE_DEPTH: {
            const int32_t stone_depth = v[4] != 0 ? f->stone_below : f->stone_above;
            const double depth = v[2] != 0 ? surface_depth : 0;
            /* math.ts's map(secondary, -1, 1, 0, range), truncated. */
            const double secondary =
                v[3] == 0 ? 0 : trunc(0 + ((column[JWG_SURFACE_COLUMN_SECONDARY] - -1) / (1 - -1)) * (v[3] - 0));
            return stone_depth <= 1 + v[1] + depth + secondary;
        }
        default:
            /* Temperature, or a condition the TypeScript could not hand over. */
            f->fallback = 1;
            return 0;
    }
}

/* A condition's answer for the block being run, computed once per block. */
static int test(Surface *s, Frame *f, int32_t index) {
    const Condition *c = &s->conditions[index];
    /* Counters are kept apart by sign: columns count up from 1, blocks down from -2. */
    const int64_t key = c->values[JWG_SURFACE_CONDITION_PER_COLUMN] != 0 ? s->column_counter : -s->block_counter - 1;
    if (s->answered_at[index] == key) return s->answers[index];
    const int holds = condition_holds(s, f, c);
    if (f->fallback) return 0;
    s->answered_at[index] = key;
    s->answers[index] = (uint8_t)holds;
    return holds;
}

/* chunk/oreVein.ts's placer: the state it places, or JWG_SURFACE_UNCHANGED. */
static int32_t ore_vein(Surface *s, Frame *f, int32_t index) {
    const Vein *v = &s->veins[index];
    if (v->has_verdicts) {
        const int32_t cx = floor_div(f->x, f->cell_xz) - f->cell_x0;
        const int32_t cy = floor_div(f->y, f->cell_y) - f->cell_y0;
        const int32_t cz = floor_div(f->z, f->cell_xz) - f->cell_z0;
        if (cx >= 0 && cx < f->cell_sx && cy >= 0 && cy < f->cell_sy && cz >= 0 && cz < f->cell_sz) {
            const size_t cells = (size_t)f->cell_sx * f->cell_sy * f->cell_sz;
            if (f->verdicts[cells * index + ((size_t)cx * f->cell_sz + cz) * f->cell_sy + cy] == JWG_SURFACE_BARREN)
                return JWG_SURFACE_UNCHANGED;
        }
    }
    const double density = jwg_program_eval(v->density, f->x, f->y, f->z);
    if (density <= 0) return JWG_SURFACE_UNCHANGED;
    Xoroshiro r = xoroshiro_at(v->seed_lo, v->seed_hi, f->x, f->y, f->z);
    if (xoroshiro_next_float(&r) > density) return JWG_SURFACE_UNCHANGED;
    if (xoroshiro_next_float(&r) < jwg_program_eval(v->richness, f->x, f->y, f->z) &&
        jwg_program_eval(v->gap, f->x, f->y, f->z) < 0) {
        return xoroshiro_next_float(&r) < v->raw_ore_chance ? v->raw_ore : v->ore;
    }
    return v->filler;
}

/* MaterialRuleInterpreter.run: the state the rule places, unchanged, or a fallback. */
static int32_t run_rule(Surface *s, Frame *f) {
    s->block_counter++;
    f->biome_known = 0;
    f->fallback = 0;
    int32_t op = 0;
    for (;;) {
        const int32_t *r = s->ops + (size_t)op * OP_WORDS;
        switch (r[0]) {
            case OP_TEST:
            case OP_TEST_NOT: {
                const int holds = test(s, f, r[1]);
                if (f->fallback) return JWG_SURFACE_FALLBACK;
                op = (holds != 0) == (r[0] == OP_TEST) ? op + 1 : r[2];
                break;
            }
            case OP_BLOCK:
                return r[1];
            case OP_ORE_VEIN: {
                const int32_t state = ore_vein(s, f, r[1]);
                if (state != JWG_SURFACE_UNCHANGED) return state;
                op = r[2];
                break;
            }
            case OP_BANDLANDS:
                return JWG_SURFACE_FALLBACK;
            default:
                return JWG_SURFACE_UNCHANGED;
        }
    }
}

static void surface_free(Surface *s) {
    if (s == NULL) return;
    free(s->ops);
    free(s->conditions);
    free(s->biome_sets);
    free(s->veins);
    free(s->answered_at);
    free(s->answers);
    free(s);
}

double jwg_surface_create(
    const int32_t *ops,
    int32_t op_count,
    const double *conditions,
    int32_t condition_count,
    const uint32_t *biome_sets,
    int32_t biome_set_words,
    int32_t biome_words,
    const double *veins,
    int32_t vein_count,
    int32_t state_count,
    double zoom_hi,
    double zoom_lo
) {
    if (op_count <= 0 || condition_count < 0 || biome_set_words < 0 || biome_words < 0 || vein_count < 0 ||
        state_count < 0)
        return 0;
    Surface *s = calloc(1, sizeof(Surface));
    if (s == NULL) return 0;
    s->op_count = op_count;
    s->condition_count = condition_count;
    s->biome_words = biome_words;
    s->vein_count = vein_count;
    s->zoom_hi = (uint32_t)zoom_hi;
    s->zoom_lo = (uint32_t)zoom_lo;
    s->ops = malloc((size_t)op_count * OP_WORDS * sizeof(int32_t));
    s->conditions = malloc((condition_count > 0 ? (size_t)condition_count : 1) * sizeof(Condition));
    s->biome_sets = malloc((biome_set_words > 0 ? (size_t)biome_set_words : 1) * sizeof(uint32_t));
    s->veins = malloc((vein_count > 0 ? (size_t)vein_count : 1) * sizeof(Vein));
    s->answered_at = malloc((condition_count > 0 ? (size_t)condition_count : 1) * sizeof(int64_t));
    s->answers = calloc(condition_count > 0 ? (size_t)condition_count : 1, 1);
    if (s->ops == NULL || s->conditions == NULL || s->biome_sets == NULL || s->veins == NULL ||
        s->answered_at == NULL || s->answers == NULL) {
        surface_free(s);
        return 0;
    }
    memcpy(s->ops, ops, (size_t)op_count * OP_WORDS * sizeof(int32_t));
    if (condition_count > 0)
        memcpy(s->conditions, conditions, (size_t)condition_count * JWG_SURFACE_CONDITION_DOUBLES * sizeof(double));
    if (biome_set_words > 0) memcpy(s->biome_sets, biome_sets, (size_t)biome_set_words * sizeof(uint32_t));
    for (int32_t i = 0; i < condition_count; i++) s->answered_at[i] = 0;
    for (int32_t i = 0; i < vein_count; i++) {
        const double *v = veins + (size_t)i * JWG_SURFACE_VEIN_DOUBLES;
        Vein *vein = &s->veins[i];
        vein->density = v[0];
        vein->richness = v[1];
        vein->gap = v[2];
        vein->raw_ore_chance = v[3];
        vein->ore = (int32_t)v[4];
        vein->raw_ore = (int32_t)v[5];
        vein->filler = (int32_t)v[6];
        vein->seed_lo = ((uint64_t)(uint32_t)v[7] << 32) | (uint32_t)v[8];
        vein->seed_hi = ((uint64_t)(uint32_t)v[9] << 32) | (uint32_t)v[10];
        vein->has_verdicts = v[11] != 0;
        if (vein->density == 0 || vein->richness == 0 || vein->gap == 0) {
            surface_free(s);
            return 0;
        }
    }
    /* Every op names a condition, state or vein that exists, and jumps inside the program. */
    for (int32_t op = 0; op < op_count; op++) {
        const int32_t *r = s->ops + (size_t)op * OP_WORDS;
        int ok = 1;
        switch (r[0]) {
            case OP_TEST:
            case OP_TEST_NOT: ok = r[1] >= 0 && r[1] < condition_count && r[2] >= 0 && r[2] < op_count; break;
            case OP_BLOCK: ok = r[1] >= 0 && r[1] < state_count; break;
            case OP_ORE_VEIN: ok = r[1] >= 0 && r[1] < vein_count && r[2] >= 0 && r[2] < op_count; break;
            case OP_BANDLANDS:
            case OP_END: break;
            default: ok = 0;
        }
        if (!ok) {
            surface_free(s);
            return 0;
        }
    }
    for (int32_t i = 0; i < condition_count; i++) {
        const double *v = s->conditions[i].values;
        if ((int32_t)v[0] == JWG_SURFACE_BIOME && (v[1] < 0 || v[1] + biome_words > biome_set_words)) {
            surface_free(s);
            return 0;
        }
    }
    if ((double)(uintptr_t)s >= 9007199254740992.0) {
        surface_free(s);
        return 0;
    }
    return (double)(uintptr_t)s;
}

void jwg_surface_destroy(double handle) {
    if (handle != 0) surface_free((Surface *)(uintptr_t)handle);
}

int32_t jwg_surface_chunk(
    double handle,
    const int32_t *frame,
    const double *columns,
    const uint8_t *blocks,
    const int32_t *biomes,
    const uint8_t *verdicts,
    int32_t *out,
    int32_t *fallbacks
) {
    Surface *s = (Surface *)(uintptr_t)handle;
    Frame f;
    memset(&f, 0, sizeof(f));
    f.chunk_x = frame[0];
    f.chunk_z = frame[1];
    f.min_y = frame[2];
    f.height = frame[3];
    f.biome_x0 = frame[4];
    f.biome_y0 = frame[5];
    f.biome_z0 = frame[6];
    f.biome_sx = frame[7];
    f.biome_sy = frame[8];
    f.biome_sz = frame[9];
    f.cell_x0 = frame[10];
    f.cell_y0 = frame[11];
    f.cell_z0 = frame[12];
    f.cell_sx = frame[13];
    f.cell_sy = frame[14];
    f.cell_sz = frame[15];
    f.cell_xz = frame[16] > 0 ? frame[16] : 1;
    f.cell_y = frame[17] > 0 ? frame[17] : 1;
    f.biomes = biomes;
    f.verdicts = verdicts;
    const int32_t height = f.height, min_y = f.min_y;
    int32_t fallback_count = 0;

    for (int32_t column = 0; column < 256; column++) {
        const int32_t local_x = column >> 4, local_z = column & 15;
        const uint8_t *categories = blocks + (size_t)column * height;
        int32_t *states = out + (size_t)column * height;
        f.column = columns + (size_t)column * JWG_SURFACE_COLUMN_FIELDS;
        f.x = f.chunk_x * 16 + local_x;
        f.z = f.chunk_z * 16 + local_z;
        s->column_counter++;
        for (int32_t i = 0; i < height; i++) states[i] = JWG_SURFACE_UNCHANGED;

        /* SurfaceSystem.buildColumn. */
        int32_t stone_above = 0, water_height = NO_WATER;
        int64_t next_ceiling = INT64_MAX;
        const int32_t starting = (int32_t)f.column[JWG_SURFACE_COLUMN_STARTING_HEIGHT];
        for (int32_t y = starting; y >= min_y; y--) {
            const uint8_t old = y - min_y < height ? categories[y - min_y] : BLOCK_AIR;
            if (old == BLOCK_AIR) {
                stone_above = 0;
                water_height = NO_WATER;
                continue;
            }
            if (old == BLOCK_FLUID) {
                if (water_height == NO_WATER) water_height = y + 1;
                continue;
            }
            if (next_ceiling >= y) {
                /* Java's DimensionType.WAY_BELOW_MIN_Y, for no opening below. */
                next_ceiling = -2048;
                for (int32_t look = y - 1; look >= min_y - 1; look--) {
                    const uint8_t next = look >= min_y ? categories[look - min_y] : BLOCK_AIR;
                    if (next != BLOCK_SOLID) {
                        next_ceiling = look + 1;
                        break;
                    }
                }
            }
            stone_above++;
            f.y = y;
            f.stone_above = stone_above;
            f.stone_below = (int32_t)(y - next_ceiling + 1);
            f.water_height = water_height;
            const int32_t state = run_rule(s, &f);
            states[y - min_y] = state;
            if (state == JWG_SURFACE_FALLBACK) {
                int32_t *entry = fallbacks + (size_t)fallback_count * 4;
                entry[0] = column * height + (y - min_y);
                entry[1] = f.stone_above;
                entry[2] = f.stone_below;
                entry[3] = water_height;
                fallback_count++;
            }
        }
    }
    return fallback_count;
}
