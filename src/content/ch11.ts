import type { Block } from "./types.js";

// Options are written with the correct answer first; the server shuffles them.
export const CH11: Block[] = [
  {
    id: "11.1", chapter: 11, title: "Messaging systems", needs: [],
    card: {
      body: [
        "Stream processing handles unbounded data: events that keep arriving, processed shortly after they happen. Producers publish events, and consumers subscribe to them, usually through a message broker.",
        "Two questions define a messaging system. What if producers send faster than consumers can handle? You can drop messages, buffer them in a queue, or apply backpressure (block the producer). And what if a node crashes? Messages may be lost unless they're written to disk and replicated.",
        "Traditional brokers (AMQP/JMS style) assign each message to one consumer, delete it once acknowledged, and redeliver it if the consumer crashes, which can change the processing order.",
      ],
      anchor: "Too fast? Drop, buffer or push back.",
      terms: ["producer / consumer", "message broker", "backpressure", "acknowledgement"],
    },
    recall: {
      q: "Backpressure means:",
      options: ["Blocking the producer when consumers can't keep up", "Dropping the oldest messages when the queue is full", "Sending each message twice to be safe", "Compressing messages to fit more in the queue"],
      answer: 0,
      why: "It's flow control, like a full Unix pipe.",
    },
    quiz: [
      {
        q: "In a traditional broker, after a consumer acknowledges a message:",
        options: ["The broker deletes it", "It's sent to all other consumers", "It's kept for replay later", "It moves to the back of the queue"],
        answer: 0,
        why: "Traditional queues don't keep history.",
      },
      {
        q: "Why can redelivery change the order of processing?",
        options: ["A crashed consumer's message is redelivered after later ones", "Brokers shuffle messages to balance the load fairly", "Producers resend their messages in reverse order", "Acknowledgements arrive before the messages they confirm"],
        answer: 0,
        why: "With load balancing, other consumers have moved on.",
      },
      {
        q: "Stream processing differs from batch mainly because the input is:",
        options: ["Unbounded and arriving continuously", "Smaller, so it always fits in the memory of one machine", "Stored in a database beforehand", "Always sorted by time"],
        answer: 0,
        why: "There's no end to wait for.",
      },
    ],
    scenario: {
      title: "The Overflowing Mailbag", npc: "Postmaster", scene: "harbor",
      story: "Ships deliver letters faster than our clerks can sort them. The mailroom is drowning.",
      ask: "What are our options?",
      choices: [
        { text: "Buffer letters in a durable queue, or tell ships to wait (backpressure); only drop letters if losing some is acceptable.", correct: true, feedback: "The three classic choices." },
        { text: "Throw the extra letters into the sea quietly.", correct: false, feedback: "Silent dropping loses data nobody agreed to lose." },
        { text: "Ask the ships to sail faster so the letters arrive sooner and the clerks can start earlier in the day.", correct: false, feedback: "That makes the flood worse." },
      ],
    },
  },
  {
    id: "11.2", chapter: 11, title: "Log-based brokers", needs: ["11.1"],
    card: {
      body: [
        "A log-based broker (like Apache Kafka) stores messages in an append-only log on disk, split into partitions. Within a partition, every message gets an increasing offset, and order is preserved.",
        "Consumers don't delete messages; each consumer group just remembers its offset in each partition. A partition is read by one consumer in the group, so parallelism equals the number of partitions.",
        "Because messages stay on disk (until old segments are dropped), a consumer can rewind its offset and reprocess history, and a new consumer can start from the beginning. Reading is non-destructive, a lot like reading a file.",
      ],
      anchor: "Append, keep, and let each reader track its own offset.",
      terms: ["log-based broker", "offset", "consumer group", "replay"],
    },
    recall: {
      q: "In a log-based broker, consuming a message:",
      options: ["Doesn't delete it; the consumer just advances its offset", "Deletes it as soon as the consumer acknowledges it", "Moves it to a separate queue of processed messages", "Locks it so no other consumer group can read it"],
      answer: 0,
      why: "That's what makes replay possible.",
    },
    quiz: [
      {
        q: "Order is guaranteed:",
        options: ["Within a partition", "Across all partitions", "Only for the first message", "Never"],
        answer: 0,
        why: "Each partition is its own ordered log.",
      },
      {
        q: "Maximum parallelism of a consumer group is limited by:",
        options: ["The number of partitions", "The number of producers", "The size of the disk", "The size of each message"],
        answer: 0,
        why: "Each partition goes to one consumer in the group.",
      },
      {
        q: "A bug corrupted yesterday's output. With a log-based broker you can:",
        options: ["Rewind the offset and reprocess", "Nothing; the messages are gone", "Only fix messages from now on", "Ask the producers to resend"],
        answer: 0,
        why: "The log still holds the messages.",
      },
    ],
    scenario: {
      title: "The Rewritten Chronicle", npc: "Royal Chronicler", scene: "library",
      story: "My translator had a bug and mistranslated a week of royal announcements. The old messenger system deleted each announcement once delivered.",
      ask: "What system would have saved us?",
      choices: [
        { text: "A log-based broker: keep announcements, fix the translator, rewind its offset and redo the week.", correct: true, feedback: "Replay is the superpower of logs." },
        { text: "A faster messenger.", correct: false, feedback: "Speed doesn't bring deleted messages back." },
        { text: "Translate everything twice from now on and compare the two versions before sending them out.", correct: false, feedback: "The lost week is still lost." },
      ],
    },
  },
  {
    id: "11.3", chapter: 11, title: "Change data capture & event sourcing", needs: ["11.2"],
    card: {
      body: [
        "Change data capture (CDC) turns a database's writes into a stream of changes, read from its replication log. Search indexes, caches and warehouses consume that stream and stay in sync, in the same order, without the app writing to each one (dual writes, which can disagree).",
        "Event sourcing goes further: the app stores every user action as an immutable event ('item added to cart', not 'cart = [...]'). The current state is derived by replaying the events, and the event log is the source of truth.",
        "In both, a log of changes is the core and other views are derived from it. Log compaction keeps only the latest value per key, so a new consumer can rebuild its state without the whole history.",
      ],
      anchor: "Stream the changes; derive everything else from the log.",
      terms: ["change data capture", "event sourcing", "dual writes", "log compaction"],
    },
    recall: {
      q: "Change data capture means:",
      options: ["Turning a database's writes into a stream others can consume", "Copying the whole database to another server every night", "Recording screenshots of what users changed in the app", "Changing the database schema without any downtime"],
      answer: 0,
      why: "Derived systems follow the changes in order.",
    },
    quiz: [
      {
        q: "Why are dual writes (app writes to DB and search index) risky?",
        options: ["Races or partial failures leave the two out of sync", "Writing to two systems is always twice as slow as writing to one", "Search indexes can't receive writes from an app", "Dual writes only work with a single leader"],
        answer: 0,
        why: "CDC gives one ordered source instead.",
      },
      {
        q: "In event sourcing, the source of truth is:",
        options: ["The log of immutable events", "The table holding current state", "The cache in front of the app", "The search index built from it"],
        answer: 0,
        why: "State is derived by replaying events.",
      },
      {
        q: "Log compaction keeps:",
        options: ["The latest value for each key", "Only the first message in each partition", "Every message ever written, forever", "A random sample of older messages"],
        answer: 0,
        why: "Enough to rebuild current state without the full history.",
      },
    ],
    scenario: {
      title: "Two Catalogues, Two Truths", npc: "Head Librarian", scene: "library",
      story: "When a book is added, our clerk writes it to the catalogue and then to the search index. Sometimes the second write fails, and the search can't find books we own.",
      ask: "What's the better design?",
      choices: [
        { text: "Write only to the catalogue and feed the search index from its change stream (CDC).", correct: true, feedback: "One ordered source; the index catches up reliably." },
        { text: "Write to the search index first, then the catalogue.", correct: false, feedback: "Then the catalogue can miss books." },
        { text: "Ask the clerks to double-check both catalogues at the end of each day and fix any differences by hand.", correct: false, feedback: "Humans don't fix races." },
      ],
    },
  },
  {
    id: "11.4", chapter: 11, title: "Time & windows", needs: ["11.2"],
    card: {
      body: [
        "Streams have two kinds of time: event time (when it happened) and processing time (when the processor saw it). They can differ a lot, for example when a phone was offline and uploads hours later. Using processing time can make a backlog look like a sudden spike.",
        "Windows group events by time. Tumbling windows are fixed and don't overlap (every minute). Hopping windows are fixed but overlap (5 minutes, every minute). Sliding windows contain events within some interval of each other. Session windows group a user's activity until a gap of inactivity.",
        "You never know for sure that all events for a window have arrived. Late events, called stragglers, must be either ignored (and counted) or used to publish a correction.",
      ],
      anchor: "Count by when it happened, and plan for latecomers.",
      terms: ["event time", "processing time", "tumbling / hopping / sliding / session window", "straggler"],
    },
    recall: {
      q: "Event time is:",
      options: ["When the event actually happened", "When the server processed the event", "When the window that holds it closed", "When it was written to the database"],
      answer: 0,
      why: "It's usually recorded by the device.",
    },
    quiz: [
      {
        q: "Fixed one-minute windows that don't overlap are:",
        options: ["Tumbling windows", "Sliding windows", "Session windows", "Hopping windows"],
        answer: 0,
        why: "Each event belongs to exactly one window.",
      },
      {
        q: "Windows that group a user's clicks until 30 minutes of inactivity are:",
        options: ["Session windows", "Tumbling windows", "Hopping windows", "Fixed windows"],
        answer: 0,
        why: "Their length depends on the activity.",
      },
      {
        q: "An event arrives after its window was published. You can:",
        options: ["Ignore it (and track how many), or publish a correction", "Change the event's timestamp so it fits the current window", "Delete the window that was published and start over", "Stop the job until a person decides what to do"],
        answer: 0,
        why: "There's no way to be certain all events have arrived.",
      },
    ],
    scenario: {
      title: "The Midnight Spike", npc: "Market Clerk", scene: "market",
      story: "After our counting machine was down for an hour, the dashboard showed a huge spike of sales at 3am, when the market was closed.",
      ask: "What went wrong?",
      choices: [
        { text: "It counted by processing time. Count sales by event time, when they actually happened.", correct: true, feedback: "The backlog was processed at 3am; the sales happened earlier." },
        { text: "Thieves were shopping at 3am.", correct: false, feedback: "The market was closed." },
        { text: "The windows are too small. Use hourly windows instead of minute windows so spikes average out.", correct: false, feedback: "Bigger windows still use the wrong clock." },
      ],
    },
  },
  {
    id: "11.5", chapter: 11, title: "Stream joins", needs: ["11.4"],
    card: {
      body: [
        "Stream-stream join: match events from two streams within a time window, like searches and clicks on the results within an hour. The processor keeps state (recent events from both sides), indexed by the join key.",
        "Stream-table join (enrichment): add data to each event from a table, for example user profile details. Instead of querying a remote database per event, the processor keeps a local copy of the table, kept up to date from the table's change stream (CDC).",
        "Table-table join: both inputs are change streams, and the output is a continuously updated materialized view, like a timeline cache. Because the table can change over time, joins depend on timing; if you need reproducible results, version the table state.",
      ],
      anchor: "Window for two streams, local copy for a table.",
      terms: ["stream-stream join", "stream-table join", "enrichment", "materialized view"],
    },
    recall: {
      q: "A stream-table join is often used to:",
      options: ["Enrich events with data like user profiles", "Sort two streams into a single order", "Delete events that are too old to matter", "Replicate one database into another"],
      answer: 0,
      why: "Each event gets extra fields from the table.",
    },
    quiz: [
      {
        q: "For a stream-table join, the processor usually:",
        options: ["Keeps a local copy of the table, updated via CDC", "Queries the remote database once for each event", "Loads the table once at startup and never updates it", "Joins the stream to the table once a day in a batch"],
        answer: 0,
        why: "Local lookups are fast and don't overload the database.",
      },
      {
        q: "Matching searches with clicks within an hour is a:",
        options: ["Stream-stream join", "Table-table join", "Broadcast hash join", "Batch sort-merge join"],
        answer: 0,
        why: "Both sides are event streams, joined in a time window.",
      },
      {
        q: "Why can stream joins give different results when rerun?",
        options: ["The table's state at the time of each event can differ", "Hash functions pick different partitions on each run", "Streams are encrypted with a different key each time", "Clocks on every processor always agree exactly"],
        answer: 0,
        why: "Join results depend on event ordering and timing.",
      },
    ],
    scenario: {
      title: "The Courier Rush", npc: "Royal Treasurer", scene: "castle",
      story: "For every purchase event, we send a courier to the registry to fetch the buyer's rank. On market days the registry collapses.",
      ask: "How do we enrich purchases without the couriers?",
      choices: [
        { text: "Keep a local copy of the registry in the processor, kept fresh from the registry's change stream.", correct: true, feedback: "A stream-table join with a local table." },
        { text: "Send two couriers per purchase so the registry answers faster.", correct: false, feedback: "Twice the collapse." },
        { text: "Skip the buyer's rank on market days and fill it in later, when the registry is quieter and the couriers are free.", correct: false, feedback: "The report would be wrong on the busiest days." },
      ],
    },
  },
  {
    id: "11.6", chapter: 11, title: "Fault tolerance in streams", needs: ["11.3", "11.5"],
    card: {
      body: [
        "In batch, a failed task is simply rerun on the same input. A stream never ends, so you can't wait until the end to make output visible.",
        "Microbatching (Spark Streaming) splits the stream into small blocks, around a second each, and treats each as a mini batch job. Checkpointing (Flink) periodically saves the processor's state, and after a crash it restarts from the last checkpoint.",
        "But once output leaves the processor (an email sent, a row written), restarting could repeat it. The goal is 'exactly-once' effects, achieved by atomic commits of output plus offsets, or by making operations idempotent so repeating them is harmless.",
      ],
      anchor: "Checkpoint the state, make the effects safe to repeat.",
      terms: ["microbatching", "checkpointing", "exactly-once", "idempotence"],
    },
    recall: {
      q: "'Exactly-once' in stream processing really means:",
      options: ["The effect is as if each event were processed once", "Each event is physically processed only one time", "No event processing can ever fail or be retried", "Events are deleted right after they're processed"],
      answer: 0,
      why: "Retries happen; their effects must not double up.",
    },
    quiz: [
      {
        q: "Checkpointing means:",
        options: ["Periodically saving the processor's state to restart from", "Checking every event twice before letting it through", "Deleting old events once they've been processed", "Sending an acknowledgement back to each producer"],
        answer: 0,
        why: "Recovery restarts from the last saved state.",
      },
      {
        q: "An idempotent operation is one that:",
        options: ["Has the same effect whether done once or many times", "Is guaranteed to run only once, ever, even after crashes and restarts", "Is always fast enough to finish in a second", "Can't fail once it has started running"],
        answer: 0,
        why: "Setting a value is idempotent; incrementing a counter isn't.",
      },
      {
        q: "Microbatching processes the stream as:",
        options: ["Many tiny batch jobs of about a second each", "One huge batch job that runs every night", "Individual events, each processed one by one", "A daily job that reads the whole log again"],
        answer: 0,
        why: "That's Spark Streaming's approach.",
      },
    ],
    scenario: {
      title: "The Double Congratulations", npc: "Royal Herald", scene: "castle",
      story: "Our announcement processor crashed and restarted from its last checkpoint. Now 200 knights received their promotion letter twice.",
      ask: "How do we stop duplicates after a restart?",
      choices: [
        { text: "Give each letter a unique ID and have the messenger skip IDs already sent (idempotent delivery).", correct: true, feedback: "Retries become harmless." },
        { text: "Never restart the processor.", correct: false, feedback: "Crashes happen anyway." },
        { text: "Checkpoint less often, so restarts happen from older states less frequently and the herald isn't bothered.", correct: false, feedback: "That makes more duplicates per crash." },
      ],
    },
  },
];
