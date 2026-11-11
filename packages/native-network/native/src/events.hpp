// The queues libdatachannel's callbacks write events into, from its own threads. Each runtime
// thread that loads the library opens its own queue, reads it with jsp_events_read once it is
// woken, and receives the events of the peer connections it created.
#pragma once

#include <cstddef>
#include <cstdint>

namespace jsp {

/** Queues one event on a queue, and wakes its reader when the queue was empty. Safe on any thread. */
void pushEvent(int32_t queue, uint8_t kind, int32_t id, int32_t value, const void *payload, size_t payloadSize);

/** Queues one event whose payload is two parts, joined. */
void pushEvent2(int32_t queue, uint8_t kind, int32_t id, int32_t value, const void *first, size_t firstSize,
                const void *second, size_t secondSize);

/** Queues a log line on the queue that asked for logs, if any. */
void pushLog(int32_t level, const char *line, size_t size);

/** Opens a queue that wakes 127.0.0.1:port; returns its handle, or 0. */
int32_t openQueue(uint16_t port, bool wantsLogs);

/** Whether a queue is open. */
bool queueOpen(int32_t queue);

/** Closes a queue and frees what it holds. */
void closeQueue(int32_t queue);

/** Closes every queue. */
void closeQueues();

} // namespace jsp
