import type { Block } from "./types.js";

// Options are written with the correct answer first; the server shuffles them.
export const CH3: Block[] = [
  {
    id: "3.1", chapter: 3, title: "Logs & hash indexes", needs: [],
    card: {
      body: [
        "The simplest database appends every write as a key,value line to the end of a file: a log. Writes are fast because appending is sequential. Reads must scan the whole log, which is O(n).",
        "An index is extra data that speeds up reads. A hash index keeps an in-memory map from each key to its byte offset in the log, so a read becomes one seek.",
        "Every index slows writes down, because it must be updated too. That trade-off is why databases don't index everything automatically: you choose indexes for the queries you actually run.",
      ],
      anchor: "Indexes trade write speed for read speed.",
      terms: ["append-only log", "index", "hash index", "byte offset"],
    },
    recall: {
      q: "What does a hash index map each key to?",
      options: ["Its byte offset in the data file", "Its value's hash", "The time it was written", "The next key in order"],
      answer: 0,
      why: "With the offset you can seek straight to the record.",
    },
    quiz: [
      {
        q: "Why are appends to a log fast on disk?",
        options: ["They are sequential writes", "They skip the disk entirely", "They are compressed to zero bytes", "They happen only at night"],
        answer: 0,
        why: "Sequential writes are much faster than random writes on both HDDs and SSDs.",
      },
      {
        q: "The main limits of an in-memory hash index are:",
        options: ["All keys must fit in RAM, and range queries are slow", "It cannot store strings", "It needs a network", "It only works for numbers"],
        answer: 0,
        why: "The map lives in memory, and hashing scatters neighbouring keys.",
      },
      {
        q: "Adding an index usually makes:",
        options: ["Reads faster and writes slower", "Reads and writes both faster", "Reads slower and writes faster", "No difference"],
        answer: 0,
        why: "Each write must also update the index.",
      },
    ],
    scenario: {
      title: "The Endless Ledger", npc: "Town Clerk", scene: "library",
      story: "We append every land sale to one ledger. Finding the latest owner of a plot means reading the whole book.",
      ask: "How do we speed this up?",
      choices: [
        { text: "Keep an index card per plot pointing to the page of its latest sale.", correct: true, feedback: "That's a hash index: key → position." },
        { text: "Rewrite the ledger alphabetically after every sale.", correct: false, feedback: "Every write becomes enormous. You'd lose the fast append." },
        { text: "Stop recording sales.", correct: false, feedback: "The clerk would like to keep the job." },
      ],
    },
  },
  {
    id: "3.2", chapter: 3, title: "SSTables & LSM-trees", needs: ["3.1"],
    card: {
      body: [
        "An append-only log grows forever, so it is split into segments. In the background, compaction merges old segments, throwing away overwritten values and keeping only the latest per key.",
        "If every segment is sorted by key (a Sorted String Table, or SSTable), merging works like merge sort and a sparse index is enough. New writes go into an in-memory sorted tree (the memtable). When it fills up, it is flushed to disk as a new SSTable.",
        "Reads check the memtable, then segments from newest to oldest. Bloom filters let a read skip segments that can't contain the key. To survive crashes, each write is also appended to a log on disk. This design is the LSM-tree.",
      ],
      anchor: "Write to memory, flush sorted, merge in the background.",
      terms: ["SSTable", "memtable", "compaction", "Bloom filter", "LSM-tree"],
    },
    recall: {
      q: "What does compaction do?",
      options: ["Merges segments and keeps only the latest value per key", "Encrypts old segments", "Moves data to the cloud", "Deletes the memtable"],
      answer: 0,
      why: "It reclaims space from overwritten and deleted keys.",
    },
    quiz: [
      {
        q: "Why keep each segment sorted by key?",
        options: ["Merging is efficient and a sparse index is enough", "Sorted files are smaller", "The OS requires it", "It makes writes random"],
        answer: 0,
        why: "Sorted runs merge in one pass and allow range scans.",
      },
      {
        q: "A Bloom filter helps an LSM-tree by:",
        options: ["Saying a key is definitely not in a segment", "Compressing values", "Sorting the memtable", "Replicating to followers"],
        answer: 0,
        why: "Reads for missing keys can skip most segments.",
      },
      {
        q: "How does an LSM-tree avoid losing the memtable in a crash?",
        options: ["It also appends each write to a log on disk", "It never crashes", "It keeps two memtables", "It writes the memtable every second"],
        answer: 0,
        why: "After a crash, the log is replayed to rebuild the memtable.",
      },
    ],
    scenario: {
      title: "The Bloated Granary", npc: "Miller", scene: "market",
      story: "Our grain records are written quickly, but lookups slow down every week and the disk keeps filling up.",
      ask: "What's missing?",
      choices: [
        { text: "Background compaction to merge segments and drop overwritten values.", correct: true, feedback: "Without compaction, segments pile up and every read checks more of them." },
        { text: "A bigger disk every week.", correct: false, feedback: "That buys time but reads keep slowing." },
        { text: "Rewrite each record in place.", correct: false, feedback: "Then it isn't log-structured any more, and writes lose their speed." },
      ],
    },
  },
  {
    id: "3.3", chapter: 3, title: "B-trees", needs: ["3.1"],
    card: {
      body: [
        "B-trees are the most widely used index. They break the database into fixed-size pages, often 4 KB, arranged in a tree. Each page holds keys plus pointers to child pages, each child covering a range of keys.",
        "A lookup walks from the root down to a leaf. With hundreds of children per page, a tree only four levels deep can index a huge amount of data. Updates overwrite pages in place; a full page splits in two and the parent is updated.",
        "Overwriting several pages is not atomic, so a crash mid-split could corrupt the tree. B-trees therefore keep a write-ahead log (WAL): every change is recorded there before it is applied to the pages.",
      ],
      anchor: "B-tree: pages in a tree, updated in place, guarded by a WAL.",
      terms: ["page", "branching factor", "page split", "write-ahead log"],
    },
    recall: {
      q: "How does a B-tree update a value?",
      options: ["Overwrites the page in place", "Appends to a new segment", "Rebuilds the whole tree", "Adds a tombstone"],
      answer: 0,
      why: "That is the core difference from log-structured storage.",
    },
    quiz: [
      {
        q: "Why is a B-tree's depth so small?",
        options: ["Each page has hundreds of children", "Keys are very short", "It only stores recent data", "It's kept in RAM"],
        answer: 0,
        why: "A high branching factor makes the tree wide and shallow.",
      },
      {
        q: "The purpose of the WAL in a B-tree is to:",
        options: ["Recover a consistent tree after a crash mid-write", "Speed up reads", "Compress pages", "Replicate to other datacenters"],
        answer: 0,
        why: "Changes are logged first, so a crash can be redone or undone.",
      },
      {
        q: "A page is full and a key must be added. What happens?",
        options: ["The page splits in two and the parent is updated", "The key is rejected", "A new tree is created", "The oldest key is deleted"],
        answer: 0,
        why: "Splits keep the tree balanced.",
      },
    ],
    scenario: {
      title: "The Storm-Torn Map", npc: "Royal Cartographer", scene: "castle",
      story: "The power failed while we were splitting a page of the map index. Now half the index points nowhere.",
      ask: "How should the index recover?",
      choices: [
        { text: "Replay the write-ahead log on restart to finish or undo the split.", correct: true, feedback: "That's exactly why the WAL exists." },
        { text: "Rebuild the whole index from scratch on every boot.", correct: false, feedback: "That works, very slowly, every single time." },
        { text: "Never split pages.", correct: false, feedback: "Then the tree can't grow." },
      ],
    },
  },
  {
    id: "3.4", chapter: 3, title: "B-tree vs LSM", needs: ["3.2", "3.3"],
    card: {
      body: [
        "Rule of thumb: LSM-trees are usually faster for writes, B-trees often faster for reads. Benchmark your own workload before trusting it.",
        "Write amplification means one logical write causes several physical writes. B-trees write the WAL and then whole pages. LSM-trees rewrite data during compaction. LSM often amplifies less, writes sequentially and compresses better.",
        "LSM's risk: compaction competes with live traffic and can cause unpredictable tail latency, and if it can't keep up, segments pile up. B-trees store each key in exactly one place, which keeps behaviour predictable and makes transactional locking simpler.",
      ],
      anchor: "LSM: write-friendly, compaction risk. B-tree: read-friendly, predictable.",
      terms: ["write amplification", "compaction debt", "tail latency"],
    },
    recall: {
      q: "Write amplification is:",
      options: ["One database write causing several disk writes", "Writing to many replicas", "Logging every read", "Writes getting louder"],
      answer: 0,
      why: "It matters for throughput and for SSD wear.",
    },
    quiz: [
      {
        q: "A write-heavy workload with spare background capacity suits:",
        options: ["An LSM-tree", "A B-tree", "No index", "A CSV file"],
        answer: 0,
        why: "Sequential writes with background compaction are LSM's strength.",
      },
      {
        q: "A risk of LSM-trees under heavy writes is:",
        options: ["Compaction falls behind and segments pile up", "Pages split too often", "The WAL gets too small", "Keys become unsorted"],
        answer: 0,
        why: "Unmerged segments slow reads and fill the disk.",
      },
      {
        q: "Why do B-trees suit transactional locking well?",
        options: ["Each key exists in exactly one place", "They have no WAL", "They never split pages", "They store keys randomly"],
        answer: 0,
        why: "Locks can be attached to a single location in the tree.",
      },
    ],
    scenario: {
      title: "The Treasurer's Choice", npc: "Treasurer", scene: "castle",
      story: "Our coin ledger has steady reads, needs predictable response times, and only modest writes.",
      ask: "Which storage engine?",
      choices: [
        { text: "A B-tree engine.", correct: true, feedback: "Read-heavy and latency-sensitive favours B-trees' predictability." },
        { text: "An LSM-tree engine.", correct: false, feedback: "Writes are modest, and compaction could add tail latency." },
        { text: "No index; scan the ledger.", correct: false, feedback: "Every read would scan everything." },
      ],
    },
  },
  {
    id: "3.5", chapter: 3, title: "OLTP, OLAP & columns", needs: ["3.1"],
    card: {
      body: [
        "OLTP is many small reads and writes by key, driven by users: orders, logins, payments. OLAP is analysts scanning millions of rows to compute aggregates.",
        "Analytics usually runs in a separate data warehouse, loaded by ETL. Warehouses often use a star schema: a large fact table of events (each sale) surrounded by dimension tables (who, what, where, when).",
        "Column-oriented storage stores each column separately. A query that touches 4 of 100 columns reads only those 4, and columns compress very well. Writes are harder, so warehouses buffer them in memory first, LSM-style.",
      ],
      anchor: "Rows for transactions, columns for analysis.",
      terms: ["OLTP", "OLAP", "data warehouse", "star schema", "column store"],
    },
    recall: {
      q: "Column storage speeds up analytics because:",
      options: ["Queries read only the columns they need", "Rows are bigger", "It has no indexes", "It skips the disk"],
      answer: 0,
      why: "Analytical queries touch few columns but many rows.",
    },
    quiz: [
      {
        q: "Which is an OLAP query?",
        options: ["Total revenue per region per month for 5 years", "Fetch order #1042", "Update a user's email", "Log a user in"],
        answer: 0,
        why: "It scans and aggregates a large slice of history.",
      },
      {
        q: "In a star schema, the fact table holds:",
        options: ["Individual events, like each sale", "Only product names", "User passwords", "Indexes"],
        answer: 0,
        why: "Dimensions describe the who/what/where; facts are the events.",
      },
      {
        q: "Why do columns compress well?",
        options: ["Values in one column are similar and repeat often", "Columns are always numbers", "They are stored in RAM", "They have no nulls"],
        answer: 0,
        why: "Repetition makes techniques like bitmap encoding very effective.",
      },
    ],
    scenario: {
      title: "The Tax Report", npc: "Mayor's Accountant", scene: "market",
      story: "Running the yearly tax report on our shop database freezes checkout for an hour.",
      ask: "What do you recommend?",
      choices: [
        { text: "Copy data into a separate column-oriented warehouse and run reports there.", correct: true, feedback: "Separating OLAP from OLTP protects checkout." },
        { text: "Add more indexes to the shop database.", correct: false, feedback: "The report scans most rows anyway, and every index slows checkout writes." },
        { text: "Run the report at peak checkout time to get it over with.", correct: false, feedback: "Customers would not thank you." },
      ],
    },
  },
];
