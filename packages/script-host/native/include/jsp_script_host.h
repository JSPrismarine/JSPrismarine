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
#define JSH_ABI_VERSION 2

/* The steps one jsh_debug_evaluate may take, apart from the budget of the script it stops in. */
#define JSH_DEBUG_EVALUATE_STEPS 100

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
	JSH_OP_GROW = 2,
	/*
	 * A script stopped under the debugger, for the jsh_debug_reason `id`. The host answers the
	 * debugger's requests, reads the stopped script through the jsh_debug_ queries, and returns 0
	 * to let the script go on, after jsh_debug_resume says how. Returning -1 terminates the script.
	 * The engine call that ran the script stays blocked the whole time.
	 */
	JSH_OP_DEBUG_PAUSED = 3,
	/*
	 * A running script has passed the number of lines jsh_debug_attach named since the last poll.
	 * The host reads what the debugger has sent without waiting, such as a pause request or new
	 * breakpoints, and returns 0.
	 */
	JSH_OP_DEBUG_POLL = 4
};

/* Why a script stopped under the debugger. */
enum jsh_debug_reason {
	JSH_DEBUG_BREAKPOINT = 0,
	JSH_DEBUG_STEP = 1,
	JSH_DEBUG_EXCEPTION = 2,
	JSH_DEBUG_PAUSE = 3
};

/* How a stopped script goes on. */
enum jsh_debug_resume {
	/* Runs until a breakpoint, a pause request or, when asked for, an exception. */
	JSH_DEBUG_CONTINUE = 0,
	/* Stops at the next line of the same function or a function that called it. */
	JSH_DEBUG_STEP_OVER = 1,
	/* Stops at the next line anywhere, including inside a function the line calls. */
	JSH_DEBUG_STEP_IN = 2,
	/* Stops at the next line of a function that called this one. */
	JSH_DEBUG_STEP_OUT = 3
};

/* The variables of a frame that jsh_debug_scope returns. */
enum jsh_debug_scope {
	/* Its arguments and local variables. */
	JSH_SCOPE_LOCAL = 0,
	/* The variables of enclosing functions that it uses. */
	JSH_SCOPE_CLOSURE = 1,
	/* The global object. */
	JSH_SCOPE_GLOBAL = 2
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

/*
 * The debugger. While none is attached the interpreter runs as it does without one. Once one is,
 * every function the engine enters reports each new line to the engine, which stops the script
 * at a breakpoint, after a step, on a pause request or on a thrown value, and sends
 * JSH_OP_DEBUG_PAUSED. Nothing here reads a clock: a script stops at the same line every run.
 * Stopping does not count steps against the budget.
 */

/*
 * Attaches the debugger. A running script sends JSH_OP_DEBUG_POLL once every `poll_lines` lines;
 * 0 or less never polls. Functions already running when it attaches do not report lines.
 */
JSH_EXPORT int32_t jsh_debug_attach(jsh_engine *engine, double poll_lines);
/* Detaches the debugger and forgets its breakpoints. A stopped script goes on when the host returns. */
JSH_EXPORT void jsh_debug_detach(jsh_engine *engine);
/*
 * Replaces the breakpoints of the file named `path`, as a script's stack traces name it, with the
 * lines listed as numbers in the `length` bytes of the transfer buffer. Returns how many it set.
 */
JSH_EXPORT int32_t jsh_debug_set_breakpoints(jsh_engine *engine, const char *path, int32_t length);
/* Stops a script on every value it throws, caught or not, while `stop` is nonzero. */
JSH_EXPORT void jsh_debug_set_stop_on_exception(jsh_engine *engine, int32_t stop);
/* Stops the running script at its next line. */
JSH_EXPORT void jsh_debug_pause(jsh_engine *engine);
/* Says how the stopped script goes on, a jsh_debug_resume. Returns 0, or JSH_INVALID when none is stopped. */
JSH_EXPORT int32_t jsh_debug_resume(jsh_engine *engine, int32_t mode);
/*
 * Writes the stopped script's stack, innermost first, as a list with four values a frame: the
 * function's name, its file name, its line and its column. A native frame has an empty file name
 * and line 0. Returns the list's length.
 */
JSH_EXPORT int32_t jsh_debug_frames(jsh_engine *engine);
/* Returns a handle to an object holding the variables of `frame` that `scope` names. */
JSH_EXPORT int32_t jsh_debug_scope(jsh_engine *engine, int32_t frame, int32_t scope);
/* Returns a handle to the value the script stopped on with JSH_DEBUG_EXCEPTION, or to undefined. */
JSH_EXPORT int32_t jsh_debug_exception(jsh_engine *engine);
/*
 * Runs `source[length]`, which must be followed by a 0 byte, as if the function in `frame` ran it,
 * with that function's variables in scope; a frame of -1 runs it as a global script. The engine
 * keeps the stopped script's step counts as they were, and gives the evaluation a budget of its
 * own, JSH_DEBUG_EVALUATE_STEPS. Returns a handle to the result, or a status.
 */
JSH_EXPORT int32_t jsh_debug_evaluate(jsh_engine *engine, int32_t frame, const uint8_t *source, int32_t length);
/*
 * Describes a value without running script: writes its kind ("object", "array", "function",
 * "error" or "proxy"), its class or function name, and a detail, the length of an array or the
 * message of an error and undefined otherwise. Returns the length written.
 */
JSH_EXPORT int32_t jsh_debug_describe(jsh_engine *engine, int32_t handle);
/*
 * Writes an object's own properties without running a getter: the number of them, then for each
 * of `count` from `start`, in the engine's key order, its name, a number, 1 for an accessor and 0
 * for a value, and its value, undefined for an accessor. Array indices come first. Handles in the
 * values belong to the host. A proxy has no properties here. Returns the length written.
 */
JSH_EXPORT int32_t jsh_debug_properties(jsh_engine *engine, int32_t handle, int32_t start, int32_t count);

#ifdef __cplusplus
}
#endif

#endif
