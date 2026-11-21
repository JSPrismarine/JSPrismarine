/*
 * The noise-driven aquifer of packages/worldgen/src/chunk/Aquifer.ts (NoiseBasedAquifer) for one
 * chunk extent, run over a whole interpolation cell at a time. Its six density functions are point
 * programs from density.c, its cell locations come from Java's Xoroshiro128++ positional random,
 * and every step follows the TypeScript's arithmetic in doubles, so each block gets the same
 * substance and the same fluid-update flag.
 */
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "jsp_native_worldgen.h"

#define X_RANGE 10
#define Y_RANGE 9
#define Z_RANGE 10
#define X_SPACING 16
#define Y_SPACING 12
#define Z_SPACING 16
#define SAMPLE_OFFSET_X -5
#define SAMPLE_OFFSET_Y 1
#define SAMPLE_OFFSET_Z -5
#define SURFACE_LEVEL_ADJUSTMENT 8
#define SIMILARITY_THRESHOLD 25.0
#define FLUID_LEVEL_CELL_WIDTH 16
#define FLUID_LEVEL_CELL_HEIGHT 40
#define FLUID_LEVEL_CELL_MIDDLE 20
#define FLUID_LEVEL_SPREAD 10
#define FLUID_LEVEL_SPREAD_RESOLUTION 3
#define LAVA_CELL_WIDTH 64
#define LAVA_SURFACE_CEILING -10
#define LAVA_NOISE_THRESHOLD 0.3
#define FLOODEDNESS_DEPTH 64
#define PARTIAL_FLOODEDNESS_FROM -0.8
#define PARTIAL_FLOODEDNESS_TO 0.4
#define FULL_FLOODEDNESS_FROM -0.3
#define FULL_FLOODEDNESS_TO 0.8
#define WAY_BELOW_MIN_Y -32512
#define LAVA_LEVEL -54
#define NEIGHBORS 12
#define MAX_SAFE_INTEGER 9007199254740991.0
#define SURFACE_SLOTS 1024

enum { PROGRAM_BARRIER, PROGRAM_FLOODEDNESS, PROGRAM_SPREAD, PROGRAM_LAVA, PROGRAM_EXCLUSION, PROGRAM_SURFACE };

typedef struct {
    int32_t level;
    uint8_t type;
} FluidStatus;

typedef struct {
    double programs[JWG_AQUIFER_PROGRAMS];
    uint64_t seed_lo, seed_hi;
    FluidStatus lava_status, sea_status;
    int32_t fluid_threshold;
    int32_t min_grid_x, min_grid_y, min_grid_z, grid_size_x, grid_size_z, grid_total;
    int32_t skip_sampling_above_y;
    FluidStatus *statuses;
    uint8_t *status_known;
    int32_t *location_x, *location_y, *location_z;
    uint8_t *location_known;
    int32_t surface_x[SURFACE_SLOTS], surface_z[SURFACE_SLOTS], surface_level[SURFACE_SLOTS];
    uint8_t surface_known[SURFACE_SLOTS];
    int has_anchor;
    int32_t anchor_x, anchor_y, anchor_z;
    int32_t neighbor_index[NEIGHBORS], neighbor_x[NEIGHBORS], neighbor_y[NEIGHBORS], neighbor_z[NEIGHBORS];
    double barrier_value;
    int barrier_known;
    int schedule_fluid_update;
} Aquifer;

static const int32_t SURFACE_OFFSETS[13][2] = {
    {0, 0}, {-2, -1}, {-1, -1}, {0, -1}, {1, -1}, {-3, 0}, {-2, 0}, {-1, 0}, {1, 0}, {-2, 1}, {-1, 1}, {0, 1}, {1, 1}};

/* math.ts: floorDiv on integers, floor as `Math.floor(v) | 0`, and the maps. */
static inline int32_t floor_div(int32_t a, int32_t b) { return (int32_t)floor((double)a / b); }
static inline int32_t floor_int(double v) { return (int32_t)floor(v); }
static inline double lerp_d(double alpha, double from, double to) { return from + alpha * (to - from); }
static inline double map_d(double value, double from_min, double from_max, double to_min, double to_max) {
    return lerp_d((value - from_min) / (from_max - from_min), to_min, to_max);
}
static inline double clamped_map(double value, double from_min, double from_max, double to_min, double to_max) {
    const double factor = (value - from_min) / (from_max - from_min);
    if (factor < 0) return to_min;
    if (factor > 1) return to_max;
    return lerp_d(factor, to_min, to_max);
}
static inline double clamp_d(double value, double min, double max) { return value < min ? min : value > max ? max : value; }

static inline double similarity(double first, double second) { return 1 - (second - first) / SIMILARITY_THRESHOLD; }

static inline int status_equal(FluidStatus a, FluidStatus b) { return a.level == b.level && a.type == b.type; }
static inline uint8_t status_at(FluidStatus status, int32_t y) { return y < status.level ? status.type : JWG_FLUID_AIR; }

static inline double sample(const Aquifer *a, int program, double x, double y, double z) {
    return jwg_program_eval(a->programs[program], x, y, z);
}

static inline FluidStatus global_fluid(const Aquifer *a, int32_t y) {
    return y < a->fluid_threshold ? a->lava_status : a->sea_status;
}

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
static int32_t xoroshiro_next_int(Xoroshiro *r, uint32_t bound) {
    uint64_t product = (uint64_t)(uint32_t)xoroshiro_next(r) * bound;
    if ((uint32_t)product < bound) {
        const uint32_t threshold = (uint32_t)(-bound) % bound;
        while ((uint32_t)product < threshold) product = (uint64_t)(uint32_t)xoroshiro_next(r) * bound;
    }
    return (int32_t)(product >> 32);
}

/* Java's Mth.getSeed, which the positional factory xors into its low half. */
static uint64_t position_seed(int32_t x, int32_t y, int32_t z) {
    const int64_t x_term = (int64_t)(int32_t)((uint32_t)x * 3129871u);
    uint64_t seed = (uint64_t)x_term ^ ((uint64_t)(int64_t)z * 116129781ull) ^ (uint64_t)(int64_t)y;
    seed = seed * seed * 42317861ull + seed * 11ull;
    return (uint64_t)((int64_t)seed >> 16);
}

static Xoroshiro positional_random(const Aquifer *a, int32_t x, int32_t y, int32_t z) {
    Xoroshiro r = {position_seed(x, y, z) ^ a->seed_lo, a->seed_hi};
    /* An all-zero state is a fixed point; Java substitutes the golden and silver ratios. */
    if (r.lo == 0 && r.hi == 0) {
        r.lo = 0x9E3779B97F4A7C15ull;
        r.hi = 0x6A09E667F3BCC909ull;
    }
    return r;
}

static inline int32_t grid_x(int32_t block) { return floor_div(block, X_SPACING); }
static inline int32_t grid_y(int32_t block) { return floor_div(block, Y_SPACING); }
static inline int32_t grid_z(int32_t block) { return floor_div(block, Z_SPACING); }

static int32_t surface_level(Aquifer *a, int32_t block_x, int32_t block_z) {
    const int32_t x = (block_x >> 2) << 2;
    const int32_t z = (block_z >> 2) << 2;
    const uint32_t slot = ((uint32_t)(x >> 2) & 31u) | (((uint32_t)(z >> 2) & 31u) << 5);
    if (a->surface_known[slot] && a->surface_x[slot] == x && a->surface_z[slot] == z) return a->surface_level[slot];
    const int32_t level = floor_int(sample(a, PROGRAM_SURFACE, x, 0, z));
    a->surface_known[slot] = 1;
    a->surface_x[slot] = x;
    a->surface_z[slot] = z;
    a->surface_level[slot] = level;
    return level;
}

static int32_t randomized_surface_level(Aquifer *a, int32_t x, int32_t y, int32_t z, int32_t lowest_surface) {
    const int32_t cell_x = floor_div(x, FLUID_LEVEL_CELL_WIDTH);
    const int32_t cell_y = floor_div(y, FLUID_LEVEL_CELL_HEIGHT);
    const int32_t cell_z = floor_div(z, FLUID_LEVEL_CELL_WIDTH);
    const int32_t middle = cell_y * FLUID_LEVEL_CELL_HEIGHT + FLUID_LEVEL_CELL_MIDDLE;
    const double spread = sample(a, PROGRAM_SPREAD, cell_x, cell_y, cell_z) * FLUID_LEVEL_SPREAD;
    const int32_t quantized = floor_int(spread / FLUID_LEVEL_SPREAD_RESOLUTION) * FLUID_LEVEL_SPREAD_RESOLUTION;
    const int32_t level = middle + quantized;
    return lowest_surface < level ? lowest_surface : level;
}

static int32_t fluid_surface_level(
    Aquifer *a, int32_t x, int32_t y, int32_t z, FluidStatus global, int32_t lowest_surface, int center_under_fluid) {
    double partially, fully;
    if (sample(a, PROGRAM_EXCLUSION, x, y, z) > 0) {
        partially = -1;
        fully = -1;
    } else {
        const double below_surface = (double)(lowest_surface + SURFACE_LEVEL_ADJUSTMENT) - y;
        const double factor = center_under_fluid ? clamped_map(below_surface, 0, FLOODEDNESS_DEPTH, 1, 0) : 0;
        const double floodedness = clamp_d(sample(a, PROGRAM_FLOODEDNESS, x, y, z), -1, 1);
        partially = floodedness - map_d(factor, 1, 0, PARTIAL_FLOODEDNESS_FROM, PARTIAL_FLOODEDNESS_TO);
        fully = floodedness - map_d(factor, 1, 0, FULL_FLOODEDNESS_FROM, FULL_FLOODEDNESS_TO);
    }
    if (fully > 0) return global.level;
    if (partially > 0) return randomized_surface_level(a, x, y, z, lowest_surface);
    return WAY_BELOW_MIN_Y;
}

static uint8_t fluid_type(Aquifer *a, int32_t x, int32_t y, int32_t z, FluidStatus global, int32_t surface_level) {
    if (surface_level <= LAVA_SURFACE_CEILING && surface_level != WAY_BELOW_MIN_Y && global.type != JWG_FLUID_LAVA) {
        const double lava = sample(a, PROGRAM_LAVA, floor_div(x, LAVA_CELL_WIDTH), floor_div(y, FLUID_LEVEL_CELL_HEIGHT),
                                   floor_div(z, LAVA_CELL_WIDTH));
        if (fabs(lava) > LAVA_NOISE_THRESHOLD) return JWG_FLUID_LAVA;
    }
    return global.type;
}

static FluidStatus compute_fluid(Aquifer *a, int32_t x, int32_t y, int32_t z) {
    const FluidStatus global = global_fluid(a, y);
    double lowest = MAX_SAFE_INTEGER;
    const int32_t top = y + Y_SPACING;
    const int32_t bottom = y - Y_SPACING;
    int center_under_fluid = 0;
    for (int offset = 0; offset < 13; offset++) {
        const int32_t sample_x = x + (SURFACE_OFFSETS[offset][0] << 4);
        const int32_t sample_z = z + (SURFACE_OFFSETS[offset][1] << 4);
        const int32_t level = surface_level(a, sample_x, sample_z);
        const int32_t adjusted = level + SURFACE_LEVEL_ADJUSTMENT;
        const int start = offset == 0;
        if (start && bottom > adjusted) return global;
        const int pokes_above = top > adjusted;
        if (pokes_above || start) {
            const FluidStatus at_surface = global_fluid(a, adjusted);
            if (status_at(at_surface, adjusted) != JWG_FLUID_AIR) {
                if (start) center_under_fluid = 1;
                if (pokes_above) return at_surface;
            }
        }
        if (level < lowest) lowest = level;
    }
    const int32_t surface = fluid_surface_level(a, x, y, z, global, (int32_t)lowest, center_under_fluid);
    const FluidStatus status = {surface, fluid_type(a, x, y, z, global, surface)};
    return status;
}

static inline int32_t grid_index(const Aquifer *a, int32_t cell_x, int32_t cell_y, int32_t cell_z) {
    return ((cell_y - a->min_grid_y) * a->grid_size_z + (cell_z - a->min_grid_z)) * a->grid_size_x +
           (cell_x - a->min_grid_x);
}

static FluidStatus aquifer_status(Aquifer *a, int32_t index) {
    if (!a->status_known[index]) {
        a->statuses[index] = compute_fluid(a, a->location_x[index], a->location_y[index], a->location_z[index]);
        a->status_known[index] = 1;
    }
    return a->statuses[index];
}

static int load_neighbors(Aquifer *a, int32_t x_anchor, int32_t y_anchor, int32_t z_anchor) {
    int neighbor = 0;
    for (int dx = 0; dx <= 1; dx++) {
        for (int dy = -1; dy <= 1; dy++) {
            for (int dz = 0; dz <= 1; dz++) {
                const int32_t cx = x_anchor + dx, cy = y_anchor + dy, cz = z_anchor + dz;
                const int32_t index = grid_index(a, cx, cy, cz);
                /* A block outside the extent the aquifer was made for has no cell to read. */
                if (index < 0 || index >= a->grid_total) return 0;
                if (!a->location_known[index]) {
                    Xoroshiro r = positional_random(a, cx, cy, cz);
                    a->location_x[index] = cx * X_SPACING + xoroshiro_next_int(&r, X_RANGE);
                    a->location_y[index] = cy * Y_SPACING + xoroshiro_next_int(&r, Y_RANGE);
                    a->location_z[index] = cz * Z_SPACING + xoroshiro_next_int(&r, Z_RANGE);
                    a->location_known[index] = 1;
                }
                a->neighbor_index[neighbor] = index;
                a->neighbor_x[neighbor] = a->location_x[index];
                a->neighbor_y[neighbor] = a->location_y[index];
                a->neighbor_z[neighbor] = a->location_z[index];
                neighbor++;
            }
        }
    }
    a->has_anchor = 1;
    a->anchor_x = x_anchor;
    a->anchor_y = y_anchor;
    a->anchor_z = z_anchor;
    return 1;
}

static double pressure(Aquifer *a, int32_t x, int32_t y, int32_t z, FluidStatus first, FluidStatus second) {
    const uint8_t type1 = status_at(first, y), type2 = status_at(second, y);
    if ((type1 == JWG_FLUID_LAVA && type2 == JWG_FLUID_WATER) || (type1 == JWG_FLUID_WATER && type2 == JWG_FLUID_LAVA))
        return 2;
    const double level_diff = fabs((double)first.level - second.level);
    if (level_diff == 0) return 0;
    const double average = 0.5 * ((double)first.level + second.level);
    const double above_average = y + 0.5 - average;
    const double from_edge = level_diff / 2 - fabs(above_average);
    double gradient;
    if (above_average > 0) {
        gradient = from_edge > 0 ? from_edge / 1.5 : from_edge / 2.5;
    } else {
        const double center = 3 + from_edge;
        gradient = center > 0 ? center / 3 : center / 10;
    }
    if (gradient < -2 || gradient > 2) return 2 * (0 + gradient);
    if (!a->barrier_known) {
        a->barrier_value = sample(a, PROGRAM_BARRIER, x, y, z);
        a->barrier_known = 1;
    }
    return 2 * (a->barrier_value + gradient);
}

#define FLOWING_UPDATE_SIMILARITY similarity(X_RANGE * X_RANGE, Y_SPACING * Y_SPACING)

/* NoiseBasedAquifer.computeSubstance: the fluid code, or JWG_FLUID_NONE to leave the default block. */
static uint8_t compute_substance(Aquifer *a, int32_t x, int32_t y, int32_t z, double density, int *ok) {
    if (density > 0) {
        a->schedule_fluid_update = 0;
        return JWG_FLUID_NONE;
    }
    const FluidStatus global = global_fluid(a, y);
    if (y > a->skip_sampling_above_y) {
        a->schedule_fluid_update = 0;
        return status_at(global, y);
    }
    if (status_at(global, y) == JWG_FLUID_LAVA) {
        a->schedule_fluid_update = 0;
        return JWG_FLUID_LAVA;
    }
    const int32_t xa = grid_x(x + SAMPLE_OFFSET_X), ya = grid_y(y + SAMPLE_OFFSET_Y), za = grid_z(z + SAMPLE_OFFSET_Z);
    if (!a->has_anchor || xa != a->anchor_x || ya != a->anchor_y || za != a->anchor_z) {
        if (!load_neighbors(a, xa, ya, za)) {
            *ok = 0;
            return JWG_FLUID_NONE;
        }
    }
    double d1 = MAX_SAFE_INTEGER, d2 = MAX_SAFE_INTEGER, d3 = MAX_SAFE_INTEGER, d4 = MAX_SAFE_INTEGER;
    int32_t c1 = 0, c2 = 0, c3 = 0, c4 = 0;
    /* The neighbors in Java's order; ties keep it. */
    for (int n = 0; n < NEIGHBORS; n++) {
        const int32_t index = a->neighbor_index[n];
        const double ox = (double)a->neighbor_x[n] - x, oy = (double)a->neighbor_y[n] - y,
                     oz = (double)a->neighbor_z[n] - z;
        const double distance = ox * ox + oy * oy + oz * oz;
        if (d1 >= distance) {
            c4 = c3; c3 = c2; c2 = c1; c1 = index;
            d4 = d3; d3 = d2; d2 = d1; d1 = distance;
        } else if (d2 >= distance) {
            c4 = c3; c3 = c2; c2 = index;
            d4 = d3; d3 = d2; d2 = distance;
        } else if (d3 >= distance) {
            c4 = c3; c3 = index;
            d4 = d3; d3 = distance;
        } else if (d4 >= distance) {
            c4 = index;
            d4 = distance;
        }
    }

    const FluidStatus s1 = aquifer_status(a, c1);
    const double sim12 = similarity(d1, d2);
    const uint8_t state = status_at(s1, y);
    if (sim12 <= 0) {
        a->schedule_fluid_update = sim12 >= FLOWING_UPDATE_SIMILARITY ? !status_equal(s1, aquifer_status(a, c2)) : 0;
        return state;
    }
    if (state == JWG_FLUID_WATER && status_at(global_fluid(a, y - 1), y - 1) == JWG_FLUID_LAVA) {
        a->schedule_fluid_update = 1;
        return state;
    }
    a->barrier_known = 0;
    const FluidStatus s2 = aquifer_status(a, c2);
    if (density + sim12 * pressure(a, x, y, z, s1, s2) > 0) {
        a->schedule_fluid_update = 0;
        return JWG_FLUID_NONE;
    }
    const FluidStatus s3 = aquifer_status(a, c3);
    const double sim13 = similarity(d1, d3);
    if (sim13 > 0 && density + sim12 * sim13 * pressure(a, x, y, z, s1, s3) > 0) {
        a->schedule_fluid_update = 0;
        return JWG_FLUID_NONE;
    }
    const double sim23 = similarity(d2, d3);
    if (sim23 > 0 && density + sim12 * sim23 * pressure(a, x, y, z, s2, s3) > 0) {
        a->schedule_fluid_update = 0;
        return JWG_FLUID_NONE;
    }
    const int flow12 = !status_equal(s1, s2);
    const int flow23 = sim23 >= FLOWING_UPDATE_SIMILARITY && !status_equal(s2, s3);
    const int flow13 = sim13 >= FLOWING_UPDATE_SIMILARITY && !status_equal(s1, s3);
    a->schedule_fluid_update = flow12 || flow23 || flow13
                                   ? 1
                                   : sim13 >= FLOWING_UPDATE_SIMILARITY &&
                                         similarity(d1, d4) >= FLOWING_UPDATE_SIMILARITY &&
                                         !status_equal(s1, aquifer_status(a, c4));
    return state;
}

static void aquifer_free(Aquifer *a) {
    if (a == NULL) return;
    free(a->statuses);
    free(a->status_known);
    free(a->location_x);
    free(a->location_y);
    free(a->location_z);
    free(a->location_known);
    free(a);
}

double jwg_aquifer_create(
    const double *programs,
    double seed_lo_hi,
    double seed_lo_lo,
    double seed_hi_hi,
    double seed_hi_lo,
    const int32_t *extent,
    int32_t sea_level,
    int32_t default_fluid,
    int32_t skip_sampling_above_y
) {
    for (int i = 0; i < JWG_AQUIFER_PROGRAMS; i++) {
        if (programs[i] == 0) return 0;
    }
    if (default_fluid < JWG_FLUID_AIR || default_fluid > JWG_FLUID_OTHER) return 0;
    const int32_t min_x = extent[0], min_y = extent[1], min_z = extent[2];
    const int32_t max_x = extent[3], max_y = extent[4], max_z = extent[5];
    if (max_x < min_x || max_y < min_y || max_z < min_z) return 0;
    Aquifer *a = calloc(1, sizeof(Aquifer));
    if (a == NULL) return 0;
    memcpy(a->programs, programs, sizeof(a->programs));
    a->seed_lo = ((uint64_t)(uint32_t)seed_lo_hi << 32) | (uint32_t)seed_lo_lo;
    a->seed_hi = ((uint64_t)(uint32_t)seed_hi_hi << 32) | (uint32_t)seed_hi_lo;
    a->lava_status.level = LAVA_LEVEL;
    a->lava_status.type = JWG_FLUID_LAVA;
    a->sea_status.level = sea_level;
    a->sea_status.type = (uint8_t)default_fluid;
    a->fluid_threshold = sea_level < LAVA_LEVEL ? sea_level : LAVA_LEVEL;
    a->skip_sampling_above_y = skip_sampling_above_y;
    /* NoiseBasedAquifer's grid: the extent's anchors and one cell beyond them each way. */
    a->min_grid_x = grid_x(min_x + SAMPLE_OFFSET_X);
    a->grid_size_x = grid_x(max_x + SAMPLE_OFFSET_X) + 1 - a->min_grid_x + 1;
    a->min_grid_y = grid_y(min_y + SAMPLE_OFFSET_Y) - 1;
    const int32_t grid_size_y = grid_y(max_y + SAMPLE_OFFSET_Y) + 1 - a->min_grid_y + 1;
    a->min_grid_z = grid_z(min_z + SAMPLE_OFFSET_Z);
    a->grid_size_z = grid_z(max_z + SAMPLE_OFFSET_Z) + 1 - a->min_grid_z + 1;
    a->grid_total = a->grid_size_x * grid_size_y * a->grid_size_z;
    const size_t total = (size_t)a->grid_total;
    a->statuses = malloc(total * sizeof(FluidStatus));
    a->status_known = calloc(total, 1);
    a->location_x = malloc(total * sizeof(int32_t));
    a->location_y = malloc(total * sizeof(int32_t));
    a->location_z = malloc(total * sizeof(int32_t));
    a->location_known = calloc(total, 1);
    if (a->statuses == NULL || a->status_known == NULL || a->location_x == NULL || a->location_y == NULL ||
        a->location_z == NULL || a->location_known == NULL || (double)(uintptr_t)a >= 9007199254740992.0) {
        aquifer_free(a);
        return 0;
    }
    return (double)(uintptr_t)a;
}

void jwg_aquifer_destroy(double handle) {
    if (handle != 0) aquifer_free((Aquifer *)(uintptr_t)handle);
}

int32_t jwg_aquifer_fill(double handle, const double *densities, const int32_t *cell, uint8_t *out) {
    Aquifer *a = (Aquifer *)(uintptr_t)handle;
    const int32_t first_x = cell[0], first_y = cell[1], first_z = cell[2];
    const int32_t last_x = cell[3], last_y = cell[4], last_z = cell[5];
    const int32_t stride_x = cell[6], stride_z = cell[7];
    int ok = 1;
    /* The cell walk's order: x, then z, then y from the top down. */
    for (int32_t x = first_x; x <= last_x; x++) {
        for (int32_t z = first_z; z <= last_z; z++) {
            for (int32_t y = last_y; y >= first_y; y--) {
                const size_t index = (size_t)(x - first_x) * stride_x + (size_t)(z - first_z) * stride_z + (y - first_y);
                const uint8_t substance = compute_substance(a, x, y, z, densities[index], &ok);
                if (!ok) return 0;
                const int schedule = substance != JWG_FLUID_NONE && substance != JWG_FLUID_AIR && a->schedule_fluid_update;
                out[index] = (uint8_t)(substance | (schedule ? JWG_FLUID_SCHEDULE : 0));
            }
        }
    }
    return 1;
}
