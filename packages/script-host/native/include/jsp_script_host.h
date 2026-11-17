/*
 * The flat C interface of JSPrismarine's script host: Fabrice Bellard's QuickJS behind one engine
 * type, bound from TypeScript through an FFI that can pass integers, doubles and pointers only.
 *
 * An engine is one QuickJS runtime with one context. It keeps all of its state, so two engines
 * run on two threads at once. An engine belongs to the thread that created it: call it, and let
 * it call back, only on that thread.
 *
 * JavaScript values stay in C. The host refers to them by handle, a positive integer that is valid
 * in its engine until jsh_free releases it. Values cross as bytes in the engine's transfer buffer,
 * which the host owns and the engine writes and reads in place. Each value is one tag byte and its
 * payload, little-endian:
 *
 *   JSH_TAG_UNDEFINED, JSH_TAG_NULL, JSH_TAG_FALSE, JSH_TAG_TRUE  no payload
 *   JSH_TAG_NUMBER                                                 an IEEE 754 double
 *   JSH_TAG_STRING                                                 a uint32 byte length and UTF-8
 *   JSH_TAG_HANDLE                                                 an int32 handle, for anything else
 *
 * A list of values is a uint32 count followed by the values.
 *
 * Every entry that runs script returns a handle or a count when it succeeds and a negative
 * JSH_STATUS when it fails. On JSH_THROWN, JSH_TERMINATED and JSH_OUT_OF_MEMORY the transfer
 * buffer holds three strings: the error's name, its message and its stack.
 */
#ifndef JSP_SCRIPT_HOST_H
#define JSP_SCRIPT_HOST_H

#include <stdint.h>

#ifdef _WIN32
#define JSH_EXPORT __declspec(dllexport)
#else
#define JSH_EXPORT __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* Changes whenever a function, a constant or the byte layout changes meaning. */
#define JSH_ABI_VERSION 1

enum jsh_tag {
	JSH_TAG_UNDEFINED = 0,
	JSH_TAG_NULL = 1,
	JSH_TAG_FALSE = 2,
	JSH_TAG_TRUE = 3,
	JSH_TAG_NUMBER = 4,
	JSH_TAG_STRING = 5,
	JSH_TAG_HANDLE = 6
};

enum jsh_status {
	/* The script threw, and nothing caught it. */
	JSH_THROWN = -1,
	/* The step budget ran out. The error is uncatchable, so no script saw it. */
	JSH_TERMINATED = -2,
	/* An allocation went over the engine's memory limit, and the error reached the host. */
	JSH_OUT_OF_MEMORY = -3,
	/* A handle, a tag or a length was not valid. */
	JSH_INVALID = -4
};

/* What the engine asks of the host through its callback. */
enum jsh_op {
	/*
	 * A script called the host function `id`. The transfer buffer holds its arguments as a
	 * list of `length` bytes. The host writes one value as the result and returns its length,
	 * or writes two strings, an error's name and message, and returns -1 to throw them.
	 * Handles among the arguments last until the call returns. The host duplicates one with
	 * jsh_dup to keep it.
	 */
	JSH_OP_CALL = 0,
	/*
	 * A script imported a module. The transfer buffer holds its normalized name, `length`
	 * bytes of UTF-8. The host writes the module's source and returns its length, or writes an
	 * error's name and message and returns -1.
	 */
	JSH_OP_LOAD_MODULE = 1,
	/*
	 * The engine needs a transfer buffer of at least `length` bytes. The host calls
	 * jsh_engine_set_buffer with a larger one before it returns, and returns 0, or returns -1
	 * when it cannot.
	 */
	JSH_OP_GROW = 2
};

/* The counters jsh_engine_stat reads. Steps are interrupt handler calls. */
enum jsh_stat {
	/* Every step the engine has taken. */
	JSH_STAT_STEPS = 0,
	/* The steps since the outermost entry from the host began. */
	JSH_STAT_CALLBACK_STEPS = 1,
	/* The steps since jsh_engine_begin_tick. */
	JSH_STAT_TICK_STEPS = 2,
	/* JSH_OP_CALL requests to the host. */
	JSH_STAT_HOST_CALLS = 3,
	/* Bytes of arguments the engine wrote for the host. */
	JSH_STAT_BYTES_TO_HOST = 4,
	/* Bytes of results and module sources the engine read from the host. */
	JSH_STAT_BYTES_FROM_HOST = 5,
	/* Stack overflows thrown, including the ones a script caught. */
	JSH_STAT_STACK_OVERFLOWS = 6,
	/* Allocations refused because of the memory limit, including the ones a script survived. */
	JSH_STAT_MEMORY_LIMIT_HITS = 7,
	/* Bytes the engine has allocated. */
	JSH_STAT_MEMORY_USED = 8,
	/* Handles in use. */
	JSH_STAT_HANDLES = 9
};

typedef struct jsh_engine jsh_engine;

/* The host's one callback. It runs synchronously on the engine's thread. */
typedef int32_t (*jsh_host_fn)(int32_t op, int32_t id, int32_t length);

JSH_EXPORT int32_t jsh_abi_version(void);

/*
 * Creates an engine whose context lacks what the pinned Bedrock Dedicated Server lacks, and whose
 * Function constructors refuse to compile a string. A limit of 0 or less leaves that limit off.
 * Returns NULL when the engine cannot be created.
 */
JSH_EXPORT jsh_engine *jsh_engine_create(jsh_host_fn host, uint8_t *buffer, int32_t capacity, double memory_limit,
										 double stack_size);
JSH_EXPORT void jsh_engine_destroy(jsh_engine *engine);
/* Replaces the transfer buffer. The engine never frees it. */
JSH_EXPORT void jsh_engine_set_buffer(jsh_engine *engine, uint8_t *buffer, int32_t capacity);
/*
 * Sets how many steps one entry from the host, with everything it calls, and one tick may take.
 * A budget of 0 or less, or infinity, is unlimited. The step past a budget terminates the script.
 */
JSH_EXPORT void jsh_engine_set_budget(jsh_engine *engine, double per_callback, double per_tick);
/* Starts a tick: the tick's step count goes back to 0. */
JSH_EXPORT void jsh_engine_begin_tick(jsh_engine *engine);
JSH_EXPORT double jsh_engine_stat(jsh_engine *engine, int32_t stat);

/* Runs a classic script. `source[length]` must be 0. Returns a handle to its completion value. */
JSH_EXPORT int32_t jsh_eval_script(jsh_engine *engine, const char *name, const uint8_t *source, int32_t length);
/*
 * Compiles and runs a module, loading what it imports through JSH_OP_LOAD_MODULE.
 * `source[length]` must be 0. Returns a handle to the module's namespace. A module that awaits
 * at its top level may still be running when this returns.
 */
JSH_EXPORT int32_t jsh_eval_module(jsh_engine *engine, const char *name, const uint8_t *source, int32_t length);
/* Runs pending promise jobs until none is left. Returns how many ran. */
JSH_EXPORT int32_t jsh_run_jobs(jsh_engine *engine);
/* Calls a function with the list of `length` bytes in the transfer buffer as its arguments. */
JSH_EXPORT int32_t jsh_call(jsh_engine *engine, int32_t function, int32_t this_value, int32_t length);

JSH_EXPORT int32_t jsh_global(jsh_engine *engine);
JSH_EXPORT int32_t jsh_get(jsh_engine *engine, int32_t object, const char *key);
/* Returns 0, or a negative status. */
JSH_EXPORT int32_t jsh_set(jsh_engine *engine, int32_t object, const char *key, int32_t value);
/* Makes a function that sends JSH_OP_CALL with `id` when a script calls it. */
JSH_EXPORT int32_t jsh_host_function(jsh_engine *engine, int32_t id, const char *name, int32_t length);
/* Makes a value from the `length` bytes of one value in the transfer buffer. */
JSH_EXPORT int32_t jsh_decode(jsh_engine *engine, int32_t length);
/* Writes a value into the transfer buffer. Returns its length. */
JSH_EXPORT int32_t jsh_encode(jsh_engine *engine, int32_t handle);
JSH_EXPORT int32_t jsh_dup(jsh_engine *engine, int32_t handle);
JSH_EXPORT void jsh_free(jsh_engine *engine, int32_t handle);

#ifdef __cplusplus
}
#endif

#endif
