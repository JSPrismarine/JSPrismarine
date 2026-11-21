/*
 * The nearest-box climate search of packages/worldgen/src/biome/Climate.ts (closestLeaf), over the
 * tree that file flattens. Every bound and target is a quantized integer held in a double, and each
 * distance is a sum of seven squares far below 2^53, so the doubles here are exact and give the
 * same leaf, including Java's prior-result pruning and its tie-break by first tree order.
 */
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "jsp_native_worldgen.h"

#define AXES 7

typedef struct {
    int32_t node_count, child_total, max_depth;
    double *bounds;
    uint32_t *child_starts, *child_counts, *children, *first_leaf_ranks;
    int32_t *value_indices;
    /* The search stack, one frame per level; a search is not reentrant. */
    uint32_t *nodes, *next_children, *pending_children;
    double *minimum_distances, *pending_distances;
    int32_t *closest_leaves;
} Climate;

static inline double parameter_distance(double min, double max, double target) {
    double above = target - max;
    double below = min - target;
    return above > 0 ? above : (below > 0 ? below : 0);
}

static double node_distance(const Climate *c, int32_t node, const double *target) {
    const double *b = c->bounds + (size_t)node * AXES * 2;
    double total = 0;
    for (int axis = 0; axis < AXES; axis++) {
        double distance = parameter_distance(b[axis * 2], b[axis * 2 + 1], target[axis]);
        total += distance * distance;
    }
    return total;
}

/* A rank to compare leaves by; a missing candidate ranks after every leaf. */
static inline double rank_of(const Climate *c, int32_t leaf) {
    return leaf < 0 ? INFINITY : (double)c->value_indices[leaf];
}

static int32_t closest_leaf(Climate *c, int32_t candidate, const double *target) {
    int32_t depth = 0;
    int32_t returned = -1;
    c->nodes[0] = 0;
    c->next_children[0] = c->child_starts[0];
    c->minimum_distances[0] = candidate < 0 ? INFINITY : node_distance(c, candidate, target);
    c->closest_leaves[0] = candidate;

    for (;;) {
        if (returned >= 0) {
            if (depth == 0) return returned;
            depth--;
            uint32_t child = c->pending_children[depth + 1];
            double child_distance = c->pending_distances[depth + 1];
            double leaf_distance = (int32_t)child == returned ? child_distance : node_distance(c, returned, target);
            double parent_minimum = c->minimum_distances[depth];
            double parent_rank = rank_of(c, c->closest_leaves[depth]);
            double leaf_rank = (double)c->value_indices[returned];
            if (parent_minimum > leaf_distance || (parent_minimum == leaf_distance && parent_rank > leaf_rank)) {
                c->minimum_distances[depth] = leaf_distance;
                c->closest_leaves[depth] = returned;
            }
            returned = -1;
            continue;
        }

        uint32_t node = c->nodes[depth];
        uint32_t child_count = c->child_counts[node];
        if (child_count == 0) {
            returned = (int32_t)node;
            continue;
        }
        uint32_t next_child = c->next_children[depth];
        uint32_t child_end = c->child_starts[node] + child_count;
        if (next_child >= child_end) {
            returned = c->closest_leaves[depth];
            if (returned < 0) return -1;
            continue;
        }

        uint32_t child = c->children[next_child];
        c->next_children[depth] = next_child + 1;
        double child_distance = node_distance(c, (int32_t)child, target);
        double minimum = c->minimum_distances[depth];
        double closest_rank = rank_of(c, c->closest_leaves[depth]);
        double first_leaf_rank = (double)c->first_leaf_ranks[child];
        if (minimum > child_distance || (minimum == child_distance && closest_rank > first_leaf_rank)) {
            if (c->child_counts[child] == 0) {
                double leaf_rank = (double)c->value_indices[child];
                if (minimum > child_distance || (minimum == child_distance && closest_rank > leaf_rank)) {
                    c->minimum_distances[depth] = child_distance;
                    c->closest_leaves[depth] = (int32_t)child;
                }
            } else {
                if (depth + 1 >= c->max_depth) return -1;
                depth++;
                c->nodes[depth] = child;
                c->next_children[depth] = c->child_starts[child];
                int32_t inherited = c->closest_leaves[depth - 1];
                c->closest_leaves[depth] = inherited;
                c->minimum_distances[depth] = inherited < 0 ? INFINITY : node_distance(c, inherited, target);
                c->pending_children[depth] = child;
                c->pending_distances[depth] = child_distance;
            }
        }
    }
}

static void climate_free(Climate *c) {
    if (c == NULL) return;
    free(c->bounds);
    free(c->child_starts);
    free(c->child_counts);
    free(c->children);
    free(c->first_leaf_ranks);
    free(c->value_indices);
    free(c->nodes);
    free(c->next_children);
    free(c->pending_children);
    free(c->minimum_distances);
    free(c->pending_distances);
    free(c->closest_leaves);
    free(c);
}

static void *copy_of(const void *from, size_t bytes) {
    void *to = malloc(bytes > 0 ? bytes : 1);
    if (to != NULL && bytes > 0) memcpy(to, from, bytes);
    return to;
}

/* Every child index names a node, every child range lies inside the child list, and leaves rank. */
static int validate(const Climate *c) {
    for (int32_t node = 0; node < c->node_count; node++) {
        uint32_t start = c->child_starts[node], count = c->child_counts[node];
        if (count > (uint32_t)c->child_total || start > (uint32_t)c->child_total - count) return 0;
        if (count == 0 && c->value_indices[node] < 0) return 0;
    }
    for (int32_t i = 0; i < c->child_total; i++) {
        if (c->children[i] >= (uint32_t)c->node_count) return 0;
    }
    return 1;
}

double jwg_climate_create(
    const double *bounds,
    const uint32_t *child_starts,
    const uint32_t *child_counts,
    const int32_t *value_indices,
    const uint32_t *first_leaf_ranks,
    int32_t node_count,
    const uint32_t *children,
    int32_t child_total,
    int32_t max_depth
) {
    if (node_count <= 0 || child_total < 0 || max_depth <= 0) return 0;
    Climate *c = calloc(1, sizeof(Climate));
    if (c == NULL) return 0;
    size_t nodes = (size_t)node_count, depth = (size_t)max_depth + 1;
    c->node_count = node_count;
    c->child_total = child_total;
    c->max_depth = (int32_t)depth;
    c->bounds = copy_of(bounds, nodes * AXES * 2 * sizeof(double));
    c->child_starts = copy_of(child_starts, nodes * sizeof(uint32_t));
    c->child_counts = copy_of(child_counts, nodes * sizeof(uint32_t));
    c->value_indices = copy_of(value_indices, nodes * sizeof(int32_t));
    c->first_leaf_ranks = copy_of(first_leaf_ranks, nodes * sizeof(uint32_t));
    c->children = copy_of(children, (size_t)child_total * sizeof(uint32_t));
    c->nodes = malloc(depth * sizeof(uint32_t));
    c->next_children = malloc(depth * sizeof(uint32_t));
    c->pending_children = malloc(depth * sizeof(uint32_t));
    c->minimum_distances = malloc(depth * sizeof(double));
    c->pending_distances = malloc(depth * sizeof(double));
    c->closest_leaves = malloc(depth * sizeof(int32_t));
    int ok = c->bounds && c->child_starts && c->child_counts && c->value_indices && c->first_leaf_ranks &&
             c->children && c->nodes && c->next_children && c->pending_children && c->minimum_distances &&
             c->pending_distances && c->closest_leaves;
    if (!ok || !validate(c) || (double)(uintptr_t)c >= 9007199254740992.0) {
        climate_free(c);
        return 0;
    }
    return (double)(uintptr_t)c;
}

void jwg_climate_destroy(double handle) {
    if (handle != 0) climate_free((Climate *)(uintptr_t)handle);
}

double jwg_climate_find(
    double handle,
    double candidate,
    double temperature,
    double humidity,
    double continentalness,
    double erosion,
    double depth,
    double weirdness
) {
    Climate *c = (Climate *)(uintptr_t)handle;
    /* The seventh axis, the offset, is always searched at 0. */
    const double target[AXES] = {temperature, humidity, continentalness, erosion, depth, weirdness, 0};
    int32_t start = candidate >= 0 && candidate < c->node_count ? (int32_t)candidate : -1;
    return closest_leaf(c, start, target);
}
