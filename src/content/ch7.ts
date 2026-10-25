import type { Block } from "./types.js";

// Options are written with the correct answer first; the server shuffles them.
export const CH7: Block[] = [
  {
    id: "7.1", chapter: 7, title: "What ACID means", needs: [],
    card: {
      body: [
        "A transaction groups several reads and writes into one logical unit: it either all happens or none of it does. ACID names its promises.",
        "Atomicity: if anything fails midway, everything is rolled back (it's really about abortability). Consistency: application invariants hold, like 'credits equal debits', but that's mostly the application's job. Isolation: concurrent transactions don't step on each other. Durability: once committed, data survives crashes.",
        "Real databases implement these differently, especially isolation, so 'ACID' on a box doesn't tell you exactly what you get.",
      ],
      anchor: "All or nothing, safe from neighbours, never forgotten.",
      terms: ["atomicity", "consistency", "isolation", "durability"],
    },
    recall: {
      q: "Atomicity in ACID mostly means:",
      options: ["A failed transaction is completely rolled back", "Every operation of the transaction runs on a single CPU core", "Data is copied to every replica", "Reads always return in constant time"],
      answer: 0,
      why: "Nothing half-done is left behind.",
    },
    quiz: [
      {
        q: "Which ACID letter depends most on the application?",
        options: ["Consistency", "Atomicity", "Isolation", "Durability"],
        answer: 0,
        why: "The database can't know your invariants; you define them.",
      },
      {
        q: "Isolation is about:",
        options: ["Concurrent transactions not interfering", "Surviving crashes and power loss", "Splitting data across partitions", "Encrypting data at rest"],
        answer: 0,
        why: "Ideally each transaction behaves as if it ran alone.",
      },
      {
        q: "Durability means committed data:",
        options: ["Survives crashes, e.g. written to disk or replicas", "Can never be deleted, even by an administrator or a later transaction", "Is always kept in the cache", "Is instantly visible on every replica"],
        answer: 0,
        why: "Commit is a promise not to forget.",
      },
    ],
    scenario: {
      title: "The Half Transfer", npc: "Royal Treasurer", scene: "castle",
      story: "We moved 100 gold from the army to the navy. The server crashed after debiting the army, and the navy never received it.",
      ask: "What should have prevented this?",
      choices: [
        { text: "Do both updates in one atomic transaction, so a crash rolls back the debit.", correct: true, feedback: "Atomicity: all or nothing." },
        { text: "Retry just the navy credit later by hand.", correct: false, feedback: "Manual fixes are how ledgers drift." },
        { text: "Buy a bigger server that never crashes, and keep the two updates as they are.", correct: false, feedback: "Every server crashes eventually." },
      ],
    },
  },
  {
    id: "7.2", chapter: 7, title: "Read committed", needs: ["7.1"],
    card: {
      body: [
        "Read committed is the most basic isolation level. It promises two things.",
        "No dirty reads: you only see data that has been committed, never another transaction's half-finished changes. No dirty writes: you only overwrite committed data; rows being written are locked until that transaction ends.",
        "Databases usually avoid dirty reads by remembering both the old committed value and the new one, serving the old value until the writer commits. Read committed is the default in many databases, but it still allows subtle anomalies.",
      ],
      anchor: "Only see and overwrite what's committed.",
      terms: ["dirty read", "dirty write", "row lock"],
    },
    recall: {
      q: "A dirty read is:",
      options: ["Seeing another transaction's uncommitted change", "Reading stale data from a lagging follower", "Reading a row that was deleted yesterday", "Reading a table without using an index"],
      answer: 0,
      why: "If that transaction aborts, you saw data that never existed.",
    },
    quiz: [
      {
        q: "How do databases usually prevent dirty writes?",
        options: ["Row-level locks held until the writer commits or aborts", "By forbidding two transactions from running at the same time on one table", "By keeping a bigger cache in front of the table", "By sorting the rows before each write"],
        answer: 0,
        why: "A second writer waits for the first to finish.",
      },
      {
        q: "How do they usually prevent dirty reads without locking readers?",
        options: ["Serve the old committed value until the writer commits", "Make every reader wait until all writers have finished", "Delete uncommitted rows before anyone can read them", "Replicate every write synchronously before it's visible"],
        answer: 0,
        why: "Read locks would make reads stall behind long writes.",
      },
      {
        q: "Does read committed prevent every concurrency problem?",
        options: ["No, anomalies like read skew can still happen", "Yes, it's equivalent to serializable isolation", "Yes, as long as each transaction touches one row", "Only when the data is stored on SSDs"],
        answer: 0,
        why: "It's the weakest of the common isolation levels.",
      },
    ],
    scenario: {
      title: "The Phantom Order", npc: "Baker's Apprentice", scene: "bakery",
      story: "I saw an order for 200 cornetti, started baking, and then the order vanished because the customer's transaction was rolled back.",
      ask: "What went wrong?",
      choices: [
        { text: "You read uncommitted data. Read committed isolation would have hidden it until it was committed.", correct: true, feedback: "A dirty read." },
        { text: "The oven is too slow.", correct: false, feedback: "The oven is innocent." },
        { text: "The order table needs an index so orders show up and disappear faster.", correct: false, feedback: "Indexes don't control visibility." },
      ],
    },
  },
  {
    id: "7.3", chapter: 7, title: "Snapshot isolation & MVCC", needs: ["7.2"],
    card: {
      body: [
        "Under read committed, a long read can see data from different moments. Alice checks two accounts while a transfer happens and briefly sees 100 gold missing. That's read skew, and it ruins backups and analytics queries.",
        "Snapshot isolation fixes it: each transaction reads from a consistent snapshot of the database as of when it started, even if other transactions commit meanwhile.",
        "It's built with MVCC (multi-version concurrency control): the database keeps several committed versions of each row, tagged with transaction IDs, and each reader sees the right version. Readers never block writers and writers never block readers. Confusingly, many databases call this 'repeatable read'.",
      ],
      anchor: "Each transaction reads its own frozen moment.",
      terms: ["read skew", "snapshot isolation", "MVCC", "repeatable read"],
    },
    recall: {
      q: "Snapshot isolation means each transaction reads:",
      options: ["A consistent snapshot from when it started", "Always the newest committed values", "Only the rows it has written itself", "The leader's data, never a follower's"],
      answer: 0,
      why: "Everything it reads comes from one point in time.",
    },
    quiz: [
      {
        q: "Read skew is a problem especially for:",
        options: ["Backups and long analytics queries", "Single-row updates by key", "Inserts into empty tables", "Creating a new index"],
        answer: 0,
        why: "Long reads see a mixture of before and after.",
      },
      {
        q: "MVCC works by:",
        options: ["Keeping several committed versions of each row", "Locking every row that a transaction reads until it commits", "Copying the whole database for each query", "Running transactions strictly one at a time"],
        answer: 0,
        why: "Each reader picks the version visible to its snapshot.",
      },
      {
        q: "A big benefit of snapshot isolation is:",
        options: ["Readers never block writers, and writers never block readers", "No extra disk space is needed for old row versions", "Two transactions can never write conflicting values", "It is exactly the same as serializable isolation"],
        answer: 0,
        why: "Versions replace locks for reads.",
      },
    ],
    scenario: {
      title: "The Shifting Census", npc: "Royal Statistician", scene: "library",
      story: "My two-hour census report counted some families twice and missed others, because people moved houses while it ran.",
      ask: "How do we get a correct report?",
      choices: [
        { text: "Run it under snapshot isolation so the whole report reads one consistent moment.", correct: true, feedback: "Read skew disappears." },
        { text: "Forbid anyone from moving house while the census report is running, so nothing changes under it.", correct: false, feedback: "Locking the kingdom isn't practical." },
        { text: "Run the report faster.", correct: false, feedback: "Faster helps a little; consistency needs a snapshot." },
      ],
    },
  },
  {
    id: "7.4", chapter: 7, title: "Lost updates", needs: ["7.2"],
    card: {
      body: [
        "A lost update happens when two transactions read a value, modify it, and write it back (read-modify-write). The second write overwrites the first, so one change disappears. Example: two people increment a counter at once and it only goes up by one.",
        "Fixes: atomic operations (UPDATE counters SET value = value + 1) done inside the database; explicit locking with SELECT ... FOR UPDATE; or compare-and-set, where an update only succeeds if the value hasn't changed since you read it.",
        "Some databases detect lost updates automatically under snapshot isolation and abort one transaction, which the app then retries.",
      ],
      anchor: "Read-modify-write needs protection.",
      terms: ["lost update", "atomic operation", "SELECT FOR UPDATE", "compare-and-set"],
    },
    recall: {
      q: "Which pattern causes lost updates?",
      options: ["Two concurrent read-modify-write cycles", "Two transactions reading the same row", "Two transactions writing different rows", "Reading from a consistent snapshot"],
      answer: 0,
      why: "Each overwrite ignores the other's change.",
    },
    quiz: [
      {
        q: "The simplest fix for a counter is:",
        options: ["An atomic increment inside the database", "Reading the value twice before writing", "Switching to a 64-bit integer column", "Adding an index on the counter"],
        answer: 0,
        why: "The database applies the change in one step.",
      },
      {
        q: "SELECT ... FOR UPDATE does what?",
        options: ["Locks the rows so others must wait to modify them", "Updates every row returned by the query to the newest version", "Returns a snapshot that can never change", "Deletes stale versions of the rows"],
        answer: 0,
        why: "Your read-modify-write cycle then runs alone.",
      },
      {
        q: "Compare-and-set succeeds only if:",
        options: ["The value hasn't changed since you read it", "The row was created earlier in this same transaction", "No index exists on that column", "The leader has approved the change"],
        answer: 0,
        why: "Otherwise you retry with the fresh value.",
      },
    ],
    scenario: {
      title: "The Vanishing Votes", npc: "Town Herald", scene: "market",
      story: "Two clerks count votes. Each reads the tally, adds one, and writes it back. Fifty votes went missing today.",
      ask: "What's the fix?",
      choices: [
        { text: "Use an atomic increment (tally = tally + 1) in the database.", correct: true, feedback: "No read-modify-write race." },
        { text: "Hire one more clerk to count the votes in parallel with the other two.", correct: false, feedback: "More clerks, more lost updates." },
        { text: "Count again tomorrow.", correct: false, feedback: "The race happens again." },
      ],
    },
  },
  {
    id: "7.5", chapter: 7, title: "Write skew & phantoms", needs: ["7.3", "7.4"],
    card: {
      body: [
        "Write skew is subtler. Two doctors are on call, and a rule says at least one must stay. Both check 'is someone else on call?', both see yes, and both go off call. Each wrote a different row, so neither lost update nor dirty write occurred, yet the rule broke.",
        "The pattern: read some rows, decide based on them, then write. If another transaction changes the rows you read, your decision is no longer valid. When the check is about rows that don't exist yet ('is this room free?'), it's a phantom.",
        "Snapshot isolation does not prevent write skew. Options: lock the rows you depend on with FOR UPDATE, materialize conflicts (add rows you can lock, like one per room per time slot), or use serializable isolation.",
      ],
      anchor: "Different rows, broken rule: write skew.",
      terms: ["write skew", "phantom", "materializing conflicts"],
    },
    recall: {
      q: "Write skew happens when:",
      options: ["Two transactions read the same data, then write different rows, breaking a rule", "Two transactions write to the same row at the same time, and one write is lost", "A transaction reads data that another transaction has not committed yet", "A follower serves a read before it has applied the latest write"],
      answer: 0,
      why: "Each decision was based on data the other changed.",
    },
    quiz: [
      {
        q: "Does snapshot isolation prevent write skew?",
        options: ["No", "Yes, always", "Only for counters", "Only on one node"],
        answer: 0,
        why: "Each transaction sees a valid snapshot; the conflict is between them.",
      },
      {
        q: "A phantom is:",
        options: ["A write that changes the result of another transaction's search query", "A read of a row that another transaction has deleted but not committed", "An index entry that points to a row that no longer exists", "A transaction that keeps running after its client has disconnected"],
        answer: 0,
        why: "For example, a new booking appearing in a room you checked was free.",
      },
      {
        q: "Materializing conflicts means:",
        options: ["Creating rows (e.g. room-slot rows) that transactions can lock", "Deleting the rows that two transactions are fighting over", "Replicating conflicting rows to a separate audit table", "Writing every conflict to a log for a human to resolve"],
        answer: 0,
        why: "It turns a phantom into a lockable row, but it's a last resort.",
      },
    ],
    scenario: {
      title: "The Empty Watchtower", npc: "Captain of the Guard", scene: "castle",
      story: "The rule: at least one guard on the tower. Both guards checked, saw the other on duty, and both left at the same moment.",
      ask: "How do we stop this?",
      choices: [
        { text: "Lock the on-duty rows you checked (FOR UPDATE), or use serializable isolation.", correct: true, feedback: "The second guard then sees the first one leaving." },
        { text: "Use snapshot isolation so that each guard sees one consistent view of the whole duty roster.", correct: false, feedback: "Snapshot isolation allows write skew." },
        { text: "Tell guards to check twice before leaving the tower.", correct: false, feedback: "Both would still see the other on duty." },
      ],
    },
  },
  {
    id: "7.6", chapter: 7, title: "Serializability", needs: ["7.5"],
    card: {
      body: [
        "Serializable isolation guarantees the result is the same as if transactions ran one at a time. There are three main ways to get it.",
        "Actual serial execution: really run transactions one at a time on a single thread. It works when transactions are short and data fits in memory, often using stored procedures. Two-phase locking (2PL): readers and writers block each other with shared and exclusive locks held until commit. It's safe, but slow, and deadlocks happen.",
        "Serializable snapshot isolation (SSI): run optimistically on snapshots, track which transactions read data that others then changed, and abort the unlucky ones at commit. It performs well when contention is low.",
      ],
      anchor: "Serial, locked, or optimistic: three roads to serializable.",
      terms: ["serializable", "two-phase locking", "SSI", "deadlock"],
    },
    recall: {
      q: "Serializable isolation guarantees:",
      options: ["The same result as running transactions one at a time", "That transactions really do run one at a time, on a single thread", "That no transaction is ever aborted", "That every read goes to the leader"],
      answer: 0,
      why: "It's about the outcome, not necessarily the execution.",
    },
    quiz: [
      {
        q: "Two-phase locking's main downside is:",
        options: ["Poor performance: lots of blocking, plus deadlocks", "It allows dirty reads between transactions", "It doesn't use any locks at all", "It only works when data fits in memory"],
        answer: 0,
        why: "Readers block writers and writers block readers.",
      },
      {
        q: "SSI is called optimistic because it:",
        options: ["Lets transactions proceed and aborts conflicting ones at commit", "Assumes the database server will never crash during a write", "Never aborts a transaction, so applications don't need retries", "Takes every lock a transaction might need before it starts"],
        answer: 0,
        why: "It checks for conflicts at the end instead of preventing them.",
      },
      {
        q: "Actual serial execution works well when:",
        options: ["Transactions are short and data fits in memory", "Transactions wait for user input along the way", "Data is spread across slow spinning disks", "Each transaction can use many CPU cores"],
        answer: 0,
        why: "One slow transaction would stall everything.",
      },
    ],
    scenario: {
      title: "The Locked Library", npc: "Head Librarian", scene: "library",
      story: "We switched to two-phase locking. Now the evening report blocks every borrower for minutes, and twice today two borrowers were stuck waiting for each other forever.",
      ask: "What do you suggest?",
      choices: [
        { text: "Try serializable snapshot isolation: optimistic, with conflicting transactions retried.", correct: true, feedback: "Readers don't block writers, and conflicts are rare here." },
        { text: "Drop back to read committed so nothing ever has to wait for a lock again, even during the report.", correct: false, feedback: "You'd lose the protection you needed." },
        { text: "Make the evening report hold its locks for longer.", correct: false, feedback: "That's the problem, not the cure." },
      ],
    },
  },
];
