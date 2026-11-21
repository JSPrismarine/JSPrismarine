/*
 * A density function tree as a flat program, evaluated one position at a time with the closures'
 * arithmetic in packages/worldgen/src/density/compile.ts, which js_math.h reproduces. The
 * operations and their operands are PointOp in packages/worldgen/src/density/densityProgram.ts.
 */
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "jsp_native_worldgen.h"
#include "js_math.h"

enum {
    OP_CONSTANT = 0,
    OP_CACHE_POINT = 1,
    OP_CACHE_COLUMN = 2,
    OP_GRADIENT = 3,
    OP_NOISE = 4,
    OP_SHIFT = 5,
    OP_BLENDED = 6,
    OP_UNARY = 7,
    OP_BINARY = 8,
    OP_BINARY_CONSTANT = 9,
    OP_ROUND = 10,
    OP_CLAMP = 11,
    OP_LERP = 12,
    OP_RANGE_CHOICE = 13,
    OP_INTERVAL_SELECT = 14,
    OP_SLICE = 15,
    OP_SPLINE_CONSTANT = 16,
    OP_SPLINE = 17,
    OP_DISTANCE = 18,
    OP_FIND_TOP_SURFACE = 19,
    OP_NEUTRAL_HOOK = 20,
    OP_BLEND_DENSITY = 21,
    OP_COUNT = 22
};

/* The column caches are direct-mapped by the low bits of x and z, as SampleContext's are. */
#define COLUMN_SIDE 16
#define COLUMN_SLOTS (COLUMN_SIDE * COLUMN_SIDE)

typedef struct {
    double x, y, z, value;
    int valid;
    double *column_x, *column_z, *column_value;
    uint8_t *column_filled;
} Cache;

typedef struct {
    int32_t node_count, constant_count, link_count, stack_count, cache_count;
    int32_t *nodes;
    double *constants;
    int32_t *links;
    double *stacks;
    Cache *caches;
} Program;

static inline double lerp_f(double alpha, double from, double to) { return F(from + F(alpha * F(to - from))); }

/* JavaScript's ToInt32 of an integral double, as `| 0` and `& mask` apply it. */
static inline int32_t to_int32(double v) {
    if (v >= -2147483648.0 && v < 2147483648.0) return (int32_t)v;
    if (!isfinite(v)) return 0;
    double wrapped = fmod(trunc(v), 4294967296.0);
    if (wrapped < 0) wrapped += 4294967296.0;
    return (int32_t)(uint32_t)wrapped;
}

static double eval(Program *p, int32_t index, double x, double y, double z);

static inline const int32_t *record(const Program *p, int32_t index) { return p->nodes + (size_t)index * JWG_PROGRAM_WORDS; }

static double gradient(const Program *p, const int32_t *r, double x, double y, double z) {
    const double *k = p->constants + r[3];
    double from_value = k[0], factor = k[1], from_coordinate = k[2];
    double coordinate = r[1] == 0 ? x : r[1] == 1 ? y : z;
    switch (r[2]) {
        case 0: /* clamp_to_edge */
            return F(from_value + F((clampd(coordinate, k[3], k[4]) - from_coordinate) * factor));
        case 1: { /* repeat: floorMod */
            double range = k[5], a = coordinate - from_coordinate;
            return F(from_value + F((a - floor(a / range) * range) * factor));
        }
        default: { /* mirrored_repeat */
            double range = k[5], relative = coordinate - from_coordinate;
            double tile = floor(relative / range);
            double local = relative - tile * range;
            return (to_int32(tile) & 1) == 0 ? F(from_value + F(local * factor)) : F(from_value + F((range - local) * factor));
        }
    }
}

static double unary(int32_t kind, double v) {
    switch (kind) {
        case 0: return fabs(v);
        case 1: return square_f(v);
        case 2: return cube_f(v);
        case 3: return F(sqrt(v));
        case 4: return v > 0 ? v : F(v * 0.5);
        case 5: return v > 0 ? v : F(v * 0.25);
        case 6: return F(1 / v);
        case 7: return -v;
        case 8: return squeeze_f(v);
        default: /* sign, as Math.sign */
            if (v != v) return v;
            return v > 0 ? 1 : v < 0 ? -1 : v;
    }
}

static double round_integer(int32_t kind, double v) {
    switch (kind) {
        case 0: return F(floor(v));
        case 1: return F(ceil(v));
        /* Java's Math.round(float): floor(x + 0.5) in double. */
        case 2: return F(floor(v + 0.5));
        default: return F(v > 0 ? floor(v) : ceil(v));
    }
}

static double distance(int32_t metric, double dx, double dy, double dz) {
    switch (metric) {
        case 0: return F(sqrt(F(F(square_f(dx) + square_f(dy)) + square_f(dz))));
        case 1: return F(F(square_f(dx) + square_f(dy)) + square_f(dz));
        case 2: return F(F(fabs(dx) + fabs(dy)) + fabs(dz));
        default: return js_max(js_max(fabs(dx), fabs(dy)), fabs(dz));
    }
}

static double spline(Program *p, const int32_t *r, double x, double y, double z) {
    int32_t count = r[2];
    const double *locations = p->constants + r[3];
    const double *derivatives = locations + count;
    const int32_t *values = p->links + r[4];
    double input = eval(p, r[1], x, y, z);
    /* binarySearch for the first location above the input, minus one. */
    int32_t start = 0, length = count;
    while (length > 0) {
        int32_t half = length / 2, middle = start + half;
        if (input < locations[middle]) {
            length = half;
        } else {
            start = middle + 1;
            length -= half + 1;
        }
    }
    start -= 1;
    if (start < 0 || start == count - 1) {
        int32_t end = start < 0 ? 0 : count - 1;
        double value = eval(p, values[end], x, y, z);
        double derivative = derivatives[end];
        if (derivative == 0) return value;
        return F(value + F(derivative * F(input - locations[end])));
    }
    double x1 = locations[start], x2 = locations[start + 1];
    double span = F(x2 - x1);
    double t = F(F(input - x1) / span);
    double y1 = eval(p, values[start], x, y, z);
    double y2 = eval(p, values[start + 1], x, y, z);
    double delta = F(y2 - y1);
    double a = F(F(derivatives[start] * span) - delta);
    double b = F(F(-derivatives[start + 1] * span) + delta);
    return F(lerp_f(t, y1, y2) + F(F(t * F(1 - t)) * lerp_f(t, a, b)));
}

static double eval(Program *p, int32_t index, double x, double y, double z) {
    const int32_t *r = record(p, index);
    const double *k = p->constants;
    switch (r[0]) {
        case OP_CONSTANT:
            return k[r[1]];
        case OP_CACHE_POINT: {
            Cache *c = &p->caches[r[2]];
            if (c->valid && c->x == x && c->y == y && c->z == z) return c->value;
            double value = eval(p, r[1], x, y, z);
            c->x = x;
            c->y = y;
            c->z = z;
            c->value = value;
            c->valid = 1;
            return value;
        }
        case OP_CACHE_COLUMN: {
            /* A tree that ignores y is sampled at Java's y = 0 slice. */
            Cache *c = &p->caches[r[2]];
            int32_t slot = (to_int32(x) & (COLUMN_SIDE - 1)) | ((to_int32(z) & (COLUMN_SIDE - 1)) << 4);
            if (c->column_filled[slot] && c->column_x[slot] == x && c->column_z[slot] == z) return c->column_value[slot];
            double value = eval(p, r[1], x, 0, z);
            c->column_x[slot] = x;
            c->column_z[slot] = z;
            c->column_value[slot] = value;
            c->column_filled[slot] = 1;
            return value;
        }
        case OP_GRADIENT:
            return gradient(p, r, x, y, z);
        case OP_NOISE: {
            double stack = p->stacks[r[1]];
            double xz_scale = k[r[5]], y_scale = k[r[5] + 1];
            if (r[2] < 0) return jwg_stack_get3(stack, x * xz_scale, y * y_scale, z * xz_scale);
            double shift_x = eval(p, r[2], x, y, z);
            if (r[3] < 0) {
                double shift_z = eval(p, r[4], x, y, z);
                return jwg_stack_get3(stack, x * xz_scale + shift_x, y * y_scale, z * xz_scale + shift_z);
            }
            double shift_y = eval(p, r[3], x, y, z);
            double shift_z = eval(p, r[4], x, y, z);
            return jwg_stack_get3(stack, x * xz_scale + shift_x, y * y_scale + shift_y, z * xz_scale + shift_z);
        }
        case OP_SHIFT: {
            double stack = p->stacks[r[1]];
            switch (r[2]) {
                case 0: return F(jwg_stack_get3(stack, x * 0.25, y * 0.25, z * 0.25) * 4);
                case 1: return F(jwg_stack_get3(stack, x * 0.25, 0, z * 0.25) * 4);
                default: return F(jwg_stack_get3(stack, z * 0.25, x * 0.25, 0) * 4);
            }
        }
        case OP_BLENDED: {
            const double *m = k + r[4];
            double selector = clampd(F(jwg_stack_get3(p->stacks[r[3]], x * m[2], y * m[3], z * m[2]) + 0.5), 0, 1);
            double low = jwg_stack_get3(p->stacks[r[1]], x * m[0], y * m[1], z * m[0]);
            double high = jwg_stack_get3(p->stacks[r[2]], x * m[0], y * m[1], z * m[0]);
            if (selector == 0) return low;
            if (selector == 1) return high;
            return lerp_f(selector, low, high);
        }
        case OP_UNARY:
            return unary(r[2], eval(p, r[1], x, y, z));
        case OP_BINARY: {
            double left = eval(p, r[1], x, y, z);
            switch (r[3]) {
                case 0: return F(left + eval(p, r[2], x, y, z));
                case 1: return F(left - eval(p, r[2], x, y, z));
                /* A zero left side answers +0 without reading the right, as the closure does. */
                case 2: return left == 0 ? 0 : F(left * eval(p, r[2], x, y, z));
                case 3: return left == 0 ? 0 : F(left / eval(p, r[2], x, y, z));
                case 4: return js_min(left, eval(p, r[2], x, y, z));
                default: return js_max(left, eval(p, r[2], x, y, z));
            }
        }
        case OP_BINARY_CONSTANT: {
            double value = eval(p, r[1], x, y, z), c = k[r[2]];
            switch (r[3]) {
                case 0: return F(value + c);
                case 1: return F(c - value);
                case 2: return F(value * c);
                case 3: return F(c / value);
                case 4: return js_min(value, c);
                default: return js_max(value, c);
            }
        }
        case OP_ROUND: {
            double value = eval(p, r[1], x, y, z);
            if (r[3] < 0) return round_integer(r[2], value);
            double step = eval(p, r[3], x, y, z);
            return step == 0 ? value : F(round_integer(r[2], F(value / step)) * step);
        }
        case OP_CLAMP:
            return clampd(eval(p, r[1], x, y, z), k[r[2]], k[r[3]]);
        case OP_LERP: {
            double weight = eval(p, r[1], x, y, z);
            if (weight == 0) return eval(p, r[2], x, y, z);
            if (weight == 1) return eval(p, r[3], x, y, z);
            double first = eval(p, r[2], x, y, z);
            double second = eval(p, r[3], x, y, z);
            return lerp_f(weight, first, second);
        }
        case OP_RANGE_CHOICE: {
            double value = eval(p, r[1], x, y, z);
            return value >= k[r[2]] && value < k[r[3]] ? eval(p, r[4], x, y, z) : eval(p, r[5], x, y, z);
        }
        case OP_INTERVAL_SELECT: {
            double value = eval(p, r[1], x, y, z);
            const int32_t *functions = p->links + r[3];
            int32_t function_count = r[4], threshold_count = r[5];
            for (int32_t i = 0; i < threshold_count; i++) {
                if (value < k[r[2] + i]) return eval(p, functions[i < function_count ? i : function_count - 1], x, y, z);
            }
            return eval(p, functions[function_count - 1], x, y, z);
        }
        case OP_SLICE: {
            double fixed = k[r[3]];
            switch (r[2]) {
                case 0: return eval(p, r[1], fixed, y, z);
                case 1: return eval(p, r[1], x, fixed, z);
                default: return eval(p, r[1], x, y, fixed);
            }
        }
        case OP_SPLINE_CONSTANT:
            return k[r[1]];
        case OP_SPLINE:
            return spline(p, r, x, y, z);
        case OP_DISTANCE: {
            const double *point = k + r[2];
            return distance(r[1], point[0] - x, point[1] - y, point[2] - z);
        }
        case OP_FIND_TOP_SURFACE: {
            double lower = k[r[3]], cell_height = k[r[3] + 1];
            double top = (double)to_int32(floor(eval(p, r[2], x, 0, z) / cell_height)) * cell_height;
            if (top <= lower) return lower;
            for (double probe = top; probe >= lower; probe -= cell_height) {
                if (eval(p, r[1], x, probe, z) > 0) return probe;
            }
            return lower;
        }
        case OP_NEUTRAL_HOOK:
            return k[r[1]];
        case OP_BLEND_DENSITY:
            return eval(p, r[1], x, y, z);
        default:
            return 0;
    }
}

/* Whether operand v names a node, a constant run or a link run that exists. */
static int node_ok(const Program *p, int32_t v) { return v >= 0 && v < p->node_count; }
static int constants_ok(const Program *p, int32_t start, int32_t count) {
    return start >= 0 && count >= 0 && start <= p->constant_count - count;
}
static int links_ok(const Program *p, int32_t start, int32_t count) {
    if (start < 0 || count < 0 || start > p->link_count - count) return 0;
    for (int32_t i = 0; i < count; i++) {
        if (!node_ok(p, p->links[start + i])) return 0;
    }
    return 1;
}
static int stack_ok(const Program *p, int32_t v) { return v >= 0 && v < p->stack_count && p->stacks[v] != 0; }
static int cache_ok(const Program *p, int32_t v) { return v >= 0 && v < p->cache_count; }

/* Checks every record's operands, so a malformed program is refused instead of read out of bounds. */
static int validate(const Program *p) {
    for (int32_t i = 0; i < p->node_count; i++) {
        const int32_t *r = record(p, i);
        int ok;
        switch (r[0]) {
            case OP_CONSTANT:
            case OP_SPLINE_CONSTANT:
            case OP_NEUTRAL_HOOK: ok = constants_ok(p, r[1], 1); break;
            case OP_CACHE_POINT:
            case OP_CACHE_COLUMN: ok = node_ok(p, r[1]) && cache_ok(p, r[2]); break;
            case OP_GRADIENT: ok = r[1] >= 0 && r[1] <= 2 && r[2] >= 0 && r[2] <= 2 && constants_ok(p, r[3], 6); break;
            case OP_NOISE:
                ok = stack_ok(p, r[1]) && constants_ok(p, r[5], 2) &&
                     (r[2] < 0 ? r[3] < 0 && r[4] < 0 : node_ok(p, r[2]) && node_ok(p, r[4]) && (r[3] < 0 || node_ok(p, r[3])));
                break;
            case OP_SHIFT: ok = stack_ok(p, r[1]) && r[2] >= 0 && r[2] <= 2; break;
            case OP_BLENDED: ok = stack_ok(p, r[1]) && stack_ok(p, r[2]) && stack_ok(p, r[3]) && constants_ok(p, r[4], 4); break;
            case OP_UNARY: ok = node_ok(p, r[1]) && r[2] >= 0 && r[2] <= 9; break;
            case OP_BINARY: ok = node_ok(p, r[1]) && node_ok(p, r[2]) && r[3] >= 0 && r[3] <= 5; break;
            case OP_BINARY_CONSTANT: ok = node_ok(p, r[1]) && constants_ok(p, r[2], 1) && r[3] >= 0 && r[3] <= 5; break;
            case OP_ROUND: ok = node_ok(p, r[1]) && r[2] >= 0 && r[2] <= 3 && (r[3] < 0 || node_ok(p, r[3])); break;
            case OP_CLAMP: ok = node_ok(p, r[1]) && constants_ok(p, r[2], 1) && constants_ok(p, r[3], 1); break;
            case OP_LERP: ok = node_ok(p, r[1]) && node_ok(p, r[2]) && node_ok(p, r[3]); break;
            case OP_RANGE_CHOICE:
                ok = node_ok(p, r[1]) && constants_ok(p, r[2], 1) && constants_ok(p, r[3], 1) && node_ok(p, r[4]) &&
                     node_ok(p, r[5]);
                break;
            case OP_INTERVAL_SELECT:
                ok = node_ok(p, r[1]) && r[4] > 0 && constants_ok(p, r[2], r[5]) && links_ok(p, r[3], r[4]);
                break;
            case OP_SLICE: ok = node_ok(p, r[1]) && r[2] >= 0 && r[2] <= 2 && constants_ok(p, r[3], 1); break;
            case OP_SPLINE:
                ok = node_ok(p, r[1]) && r[2] > 0 && constants_ok(p, r[3], r[2] * 2) && links_ok(p, r[4], r[2]);
                break;
            case OP_DISTANCE: ok = r[1] >= 0 && r[1] <= 3 && constants_ok(p, r[2], 3); break;
            case OP_FIND_TOP_SURFACE: ok = node_ok(p, r[1]) && node_ok(p, r[2]) && constants_ok(p, r[3], 2); break;
            case OP_BLEND_DENSITY: ok = node_ok(p, r[1]); break;
            default: ok = 0;
        }
        if (!ok) return 0;
    }
    return 1;
}

static void program_free(Program *p) {
    if (p == NULL) return;
    if (p->caches != NULL) {
        for (int32_t i = 0; i < p->cache_count; i++) {
            free(p->caches[i].column_x);
            free(p->caches[i].column_z);
            free(p->caches[i].column_value);
            free(p->caches[i].column_filled);
        }
    }
    free(p->caches);
    free(p->nodes);
    free(p->constants);
    free(p->links);
    free(p->stacks);
    free(p);
}

/* A copy of count elements of size bytes, or NULL; at least one byte, so 0 elements still allocate. */
static void *copy_of(const void *from, int32_t count, size_t size) {
    void *to = malloc(count > 0 ? (size_t)count * size : 1);
    if (to != NULL && count > 0) memcpy(to, from, (size_t)count * size);
    return to;
}

double jwg_program_create(
    const int32_t *nodes,
    int32_t node_count,
    const double *constants,
    int32_t constant_count,
    const int32_t *links,
    int32_t link_count,
    const double *stacks,
    int32_t stack_count,
    int32_t cache_slots
) {
    if (node_count <= 0 || constant_count < 0 || link_count < 0 || stack_count < 0 || cache_slots < 0) return 0;
    Program *p = calloc(1, sizeof(Program));
    if (p == NULL) return 0;
    p->node_count = node_count;
    p->constant_count = constant_count;
    p->link_count = link_count;
    p->stack_count = stack_count;
    p->cache_count = cache_slots;
    p->nodes = copy_of(nodes, node_count * JWG_PROGRAM_WORDS, sizeof(int32_t));
    p->constants = copy_of(constants, constant_count, sizeof(double));
    p->links = copy_of(links, link_count, sizeof(int32_t));
    p->stacks = copy_of(stacks, stack_count, sizeof(double));
    p->caches = calloc(cache_slots > 0 ? (size_t)cache_slots : 1, sizeof(Cache));
    int ok = p->nodes != NULL && p->constants != NULL && p->links != NULL && p->stacks != NULL && p->caches != NULL;
    for (int32_t i = 0; ok && i < cache_slots; i++) {
        Cache *c = &p->caches[i];
        c->column_x = malloc(COLUMN_SLOTS * sizeof(double));
        c->column_z = malloc(COLUMN_SLOTS * sizeof(double));
        c->column_value = malloc(COLUMN_SLOTS * sizeof(double));
        c->column_filled = calloc(COLUMN_SLOTS, 1);
        ok = c->column_x != NULL && c->column_z != NULL && c->column_value != NULL && c->column_filled != NULL;
    }
    if (!ok || !validate(p) || (double)(uintptr_t)p >= 9007199254740992.0) {
        program_free(p);
        return 0;
    }
    return (double)(uintptr_t)p;
}

void jwg_program_destroy(double handle) {
    if (handle != 0) program_free((Program *)(uintptr_t)handle);
}

double jwg_program_eval(double handle, double x, double y, double z) {
    return eval((Program *)(uintptr_t)handle, 0, x, y, z);
}
