/*
 * A density function tree evaluated one node at a time over a whole interpolation cell: the
 * interpreter of packages/worldgen/src/density/cellProgram.ts (CellProgram.run) over the same
 * records, with each `interpolated` node filled from its eight corners the way compile.ts's
 * fillCell fills it. Buffers are laid out x-major, then z, then y, as the TypeScript lays them out.
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "jsp_native_worldgen.h"
#include "js_math.h"

/* CellOp in cellProgram.ts. */
enum {
    CELL_CONSTANT = 0,
    CELL_COPY = 1,
    CELL_HOOK = 2,
    CELL_INTERPOLATED = 3,
    CELL_ABS = 4,
    CELL_SQUARE = 5,
    CELL_CUBE = 6,
    CELL_HALF_NEGATIVE = 7,
    CELL_QUARTER_NEGATIVE = 8,
    CELL_NEGATE = 9,
    CELL_SQUEEZE = 10,
    CELL_CLAMP = 11,
    CELL_ADD = 12,
    CELL_SUB = 13,
    CELL_MUL_CONSTANT = 14,
    CELL_MUL = 15,
    CELL_MIN = 16,
    CELL_MAX = 17,
    CELL_RANGE_CHOICE = 18,
    CELL_FALLBACK = 19
};

/* The largest cell the TypeScript buffers, MAX_INTERPOLATION_BUFFER_VALUES in compile.ts. */
#define MAX_CELL_VALUES 4096

typedef struct {
    int32_t node_count, constant_count, cell_count, xz, y, size;
    int32_t *nodes;
    double *constants;
    double *buffers;
    int32_t *filled_in;
    int32_t fill_number;
    double *alpha_xz;
    double inverse_y;
    /* The corners of the fill in progress, eight per interpolated cell. */
    const double *corners;
} CellProgram;

static inline const int32_t *cell_record(const CellProgram *p, int32_t index) {
    return p->nodes + (size_t)index * JWG_CELL_WORDS;
}

/* compile.ts's fillCell: the four z edges, then x, then y as a running sum of one step a block. */
static void fill_interpolated(const CellProgram *p, const double *c, double *out) {
    const double c000 = c[0], c100 = c[1], c010 = c[2], c110 = c[3];
    const double c001 = c[4], c101 = c[5], c011 = c[6], c111 = c[7];
    for (int32_t local_z = 0; local_z < p->xz; local_z++) {
        const double alpha_z = p->alpha_xz[local_z];
        const double e00 = F(c000 + F(alpha_z * F(c001 - c000)));
        const double e01 = F(c100 + F(alpha_z * F(c101 - c100)));
        const double e10 = F(c010 + F(alpha_z * F(c011 - c010)));
        const double e11 = F(c110 + F(alpha_z * F(c111 - c110)));
        for (int32_t local_x = 0; local_x < p->xz; local_x++) {
            const double alpha_x = p->alpha_xz[local_x];
            const double low = F(e00 + F(alpha_x * F(e01 - e00)));
            const double high = F(e10 + F(alpha_x * F(e11 - e10)));
            const double step = F(F(high - low) * p->inverse_y);
            /* The TypeScript adds step * 0, which turns a -0 into +0. */
            double value = F(low + F(step * 0));
            double *column = out + (size_t)(local_x * p->xz + local_z) * p->y;
            for (int32_t local_y = 0; local_y < p->y; local_y++) {
                column[local_y] = value;
                value = F(value + step);
            }
        }
    }
}

static void run(CellProgram *p, int32_t index);

static void range_choice(CellProgram *p, const int32_t *r, double *out) {
    const int32_t size = p->size;
    const double min = p->constants[r[2]], max = p->constants[r[3]];
    run(p, r[1]);
    const double *in = p->buffers + (size_t)r[1] * size;
    int32_t in_range = 0;
    for (int32_t i = 0; i < size; i++) {
        if (in[i] >= min && in[i] < max) in_range++;
    }
    /* A branch no position takes is not filled, as in the TypeScript. */
    if (in_range == size || in_range == 0) {
        const int32_t taken = in_range == size ? r[4] : r[5];
        run(p, taken);
        memmove(out, p->buffers + (size_t)taken * size, (size_t)size * sizeof(double));
        return;
    }
    run(p, r[4]);
    run(p, r[5]);
    const double *inside = p->buffers + (size_t)r[4] * size;
    const double *outside = p->buffers + (size_t)r[5] * size;
    for (int32_t i = 0; i < size; i++) out[i] = in[i] >= min && in[i] < max ? inside[i] : outside[i];
}

/* Fills node `index`'s buffer for the current cell, once however often the tree reaches it. */
static void run(CellProgram *p, int32_t index) {
    if (p->filled_in[index] == p->fill_number) return;
    p->filled_in[index] = p->fill_number;
    const int32_t *r = cell_record(p, index);
    const int32_t size = p->size;
    double *out = p->buffers + (size_t)index * size;

    switch (r[0]) {
        case CELL_CONSTANT:
        case CELL_HOOK: {
            /* A hook runs here only when the context has none, which is its neutral constant. */
            const double value = p->constants[r[0] == CELL_CONSTANT ? r[1] : r[2]];
            for (int32_t i = 0; i < size; i++) out[i] = value;
            return;
        }
        case CELL_COPY:
            run(p, r[1]);
            memmove(out, p->buffers + (size_t)r[1] * size, (size_t)size * sizeof(double));
            return;
        case CELL_INTERPOLATED:
            fill_interpolated(p, p->corners + (size_t)r[1] * 8, out);
            return;
        case CELL_RANGE_CHOICE:
            range_choice(p, r, out);
            return;
    }

    run(p, r[1]);
    const double *in = p->buffers + (size_t)r[1] * size;
    switch (r[0]) {
        case CELL_ABS:
            for (int32_t i = 0; i < size; i++) out[i] = fabs(in[i]);
            return;
        case CELL_SQUARE:
            for (int32_t i = 0; i < size; i++) out[i] = square_f(in[i]);
            return;
        case CELL_CUBE:
            for (int32_t i = 0; i < size; i++) out[i] = cube_f(in[i]);
            return;
        case CELL_HALF_NEGATIVE:
            for (int32_t i = 0; i < size; i++) out[i] = in[i] > 0 ? in[i] : F(in[i] * 0.5);
            return;
        case CELL_QUARTER_NEGATIVE:
            for (int32_t i = 0; i < size; i++) out[i] = in[i] > 0 ? in[i] : F(in[i] * 0.25);
            return;
        case CELL_NEGATE:
            for (int32_t i = 0; i < size; i++) out[i] = -in[i];
            return;
        case CELL_SQUEEZE:
            for (int32_t i = 0; i < size; i++) out[i] = squeeze_f(in[i]);
            return;
        case CELL_CLAMP: {
            const double min = p->constants[r[2]], max = p->constants[r[3]];
            for (int32_t i = 0; i < size; i++) out[i] = clampd(in[i], min, max);
            return;
        }
        case CELL_MUL: {
            /* The closure skips the right side where the left is zero, and answers +0. */
            int any_non_zero = 0;
            for (int32_t i = 0; i < size && !any_non_zero; i++) any_non_zero = in[i] != 0;
            if (!any_non_zero) {
                for (int32_t i = 0; i < size; i++) out[i] = 0;
                return;
            }
            run(p, r[2]);
            const double *right = p->buffers + (size_t)r[2] * size;
            for (int32_t i = 0; i < size; i++) out[i] = in[i] == 0 ? 0 : F(in[i] * right[i]);
            return;
        }
    }

    run(p, r[2]);
    const double *right = p->buffers + (size_t)r[2] * size;
    switch (r[0]) {
        case CELL_ADD:
            for (int32_t i = 0; i < size; i++) out[i] = F(in[i] + right[i]);
            return;
        case CELL_SUB:
            for (int32_t i = 0; i < size; i++) out[i] = F(in[i] - right[i]);
            return;
        case CELL_MUL_CONSTANT:
            for (int32_t i = 0; i < size; i++) out[i] = F(in[i] * right[i]);
            return;
        case CELL_MIN:
            for (int32_t i = 0; i < size; i++) out[i] = js_min(in[i], right[i]);
            return;
        case CELL_MAX:
            for (int32_t i = 0; i < size; i++) out[i] = js_max(in[i], right[i]);
            return;
    }
}

static int node_ok(const CellProgram *p, int32_t v) { return v >= 0 && v < p->node_count; }
static int constant_ok(const CellProgram *p, int32_t v) { return v >= 0 && v < p->constant_count; }

/* Every operand names something that exists. A fallback op runs a TypeScript closure, so a
   program holding one is refused and stays in TypeScript. */
static int validate(const CellProgram *p) {
    for (int32_t index = 0; index < p->node_count; index++) {
        const int32_t *r = cell_record(p, index);
        int ok;
        switch (r[0]) {
            case CELL_CONSTANT: ok = constant_ok(p, r[1]); break;
            case CELL_HOOK: ok = constant_ok(p, r[2]); break;
            case CELL_INTERPOLATED: ok = r[1] >= 0 && r[1] < p->cell_count; break;
            case CELL_COPY:
            case CELL_ABS:
            case CELL_SQUARE:
            case CELL_CUBE:
            case CELL_HALF_NEGATIVE:
            case CELL_QUARTER_NEGATIVE:
            case CELL_NEGATE:
            case CELL_SQUEEZE: ok = node_ok(p, r[1]); break;
            case CELL_CLAMP: ok = node_ok(p, r[1]) && constant_ok(p, r[2]) && constant_ok(p, r[3]); break;
            case CELL_ADD:
            case CELL_SUB:
            case CELL_MUL_CONSTANT:
            case CELL_MUL:
            case CELL_MIN:
            case CELL_MAX: ok = node_ok(p, r[1]) && node_ok(p, r[2]); break;
            case CELL_RANGE_CHOICE:
                ok = node_ok(p, r[1]) && constant_ok(p, r[2]) && constant_ok(p, r[3]) && node_ok(p, r[4]) &&
                     node_ok(p, r[5]);
                break;
            default: ok = 0;
        }
        if (!ok) return 0;
    }
    return 1;
}

static void cell_free(CellProgram *p) {
    if (p == NULL) return;
    free(p->nodes);
    free(p->constants);
    free(p->buffers);
    free(p->filled_in);
    free(p->alpha_xz);
    free(p);
}

double jwg_cell_create(
    const int32_t *nodes,
    int32_t node_count,
    const double *constants,
    int32_t constant_count,
    int32_t cell_count,
    int32_t xz,
    int32_t y
) {
    if (node_count <= 0 || constant_count < 0 || cell_count < 0 || xz <= 0 || y <= 0) return 0;
    if ((int64_t)xz * xz * y > MAX_CELL_VALUES) return 0;
    CellProgram *p = calloc(1, sizeof(CellProgram));
    if (p == NULL) return 0;
    p->node_count = node_count;
    p->constant_count = constant_count;
    p->cell_count = cell_count;
    p->xz = xz;
    p->y = y;
    p->size = xz * xz * y;
    p->nodes = malloc((size_t)node_count * JWG_CELL_WORDS * sizeof(int32_t));
    p->constants = malloc((constant_count > 0 ? (size_t)constant_count : 1) * sizeof(double));
    p->buffers = malloc((size_t)node_count * p->size * sizeof(double));
    p->filled_in = malloc((size_t)node_count * sizeof(int32_t));
    p->alpha_xz = malloc((size_t)xz * sizeof(double));
    if (p->nodes == NULL || p->constants == NULL || p->buffers == NULL || p->filled_in == NULL ||
        p->alpha_xz == NULL) {
        cell_free(p);
        return 0;
    }
    memcpy(p->nodes, nodes, (size_t)node_count * JWG_CELL_WORDS * sizeof(int32_t));
    if (constant_count > 0) memcpy(p->constants, constants, (size_t)constant_count * sizeof(double));
    for (int32_t i = 0; i < node_count; i++) p->filled_in[i] = -1;
    /* Java's volume path weights by i * (1f / size), which compile.ts keeps. */
    const double inverse_xz = F(1.0 / xz);
    for (int32_t step = 0; step < xz; step++) p->alpha_xz[step] = F(step * inverse_xz);
    p->inverse_y = F(1.0 / y);
    if (!validate(p) || (double)(uintptr_t)p >= 9007199254740992.0) {
        cell_free(p);
        return 0;
    }
    return (double)(uintptr_t)p;
}

void jwg_cell_destroy(double handle) {
    if (handle != 0) cell_free((CellProgram *)(uintptr_t)handle);
}

void jwg_cell_fill(double handle, const double *corners, double *out) {
    CellProgram *p = (CellProgram *)(uintptr_t)handle;
    /* Each fill gets a new number; on the wrap every node is marked unfilled again. */
    p->fill_number = p->fill_number == INT32_MAX ? 0 : p->fill_number + 1;
    if (p->fill_number == 0) {
        for (int32_t i = 0; i < p->node_count; i++) p->filled_in[i] = -1;
    }
    p->corners = corners;
    run(p, 0);
    memcpy(out, p->buffers, (size_t)p->size * sizeof(double));
}
