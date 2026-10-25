import type { Block } from "./types.js";

// Options are written with the correct answer first; the server shuffles them.
export const CH10: Block[] = [
  {
    id: "10.1", chapter: 10, title: "The Unix philosophy", needs: [],
    card: {
      body: [
        "Batch processing takes a large, fixed input and produces an output, often taking minutes or hours. Its performance is measured by throughput, not response time.",
        "Unix tools are a good model: each program does one thing well, and you chain them with pipes, like cat log | awk | sort | uniq -c. They all share a uniform interface (a stream of lines), so any tool can feed any other.",
        "The input is never modified, so you can rerun a pipeline as often as you like, inspect intermediate output, and try again after a mistake. Batch frameworks keep these ideas and spread them over many machines.",
      ],
      anchor: "Small tools, one interface, immutable input.",
      terms: ["batch processing", "throughput", "pipes", "uniform interface"],
    },
    recall: {
      q: "Batch jobs are mainly measured by:",
      options: ["Throughput", "Response time per request", "Number of concurrent users", "Lines of code per job"],
      answer: 0,
      why: "How much data they get through per hour.",
    },
    quiz: [
      {
        q: "What lets any Unix tool feed any other?",
        options: ["A uniform interface: streams of lines", "A shared database that every tool reads", "Being written in the same programming language", "Running with root permissions"],
        answer: 0,
        why: "Everything speaks the same simple format.",
      },
      {
        q: "Why does treating input as immutable help?",
        options: ["You can rerun the job safely after a bug", "It saves disk space, because nothing is copied during the job", "It makes each run noticeably faster", "It keeps the input encrypted at rest"],
        answer: 0,
        why: "Nothing is destroyed by a failed run.",
      },
      {
        q: "Which is a batch job?",
        options: ["Building a search index from all documents overnight", "Serving a login request when a user signs in", "Delivering a chat message to a friend's phone", "Rendering a single web page for a visitor"],
        answer: 0,
        why: "Big fixed input, offline, throughput-bound.",
      },
    ],
    scenario: {
      title: "The Gatekeeper's Log", npc: "Captain of the Guard", scene: "castle",
      story: "I want the five most frequent visitors from a year of gate logs, and I'm afraid of ruining the logs while I experiment.",
      ask: "What approach?",
      choices: [
        { text: "Chain small tools over the logs and write the results to a new file; never modify the logs.", correct: true, feedback: "Immutable input means you can experiment freely." },
        { text: "Edit the log file in place as you go.", correct: false, feedback: "One mistake destroys the data." },
        { text: "Load the whole year of logs into a spreadsheet and sort the visitors by hand with filters.", correct: false, feedback: "Slow, and one wrong edit changes the original data." },
      ],
    },
  },
  {
    id: "10.2", chapter: 10, title: "MapReduce & HDFS", needs: ["10.1"],
    card: {
      body: [
        "MapReduce is Unix pipes spread over thousands of machines, reading from and writing to a distributed filesystem like HDFS. Each file is split into blocks, replicated across machines.",
        "A job has two callbacks. The mapper is called once per input record and emits key-value pairs. The framework then sorts and groups pairs by key (the shuffle), and the reducer is called once per key with all its values.",
        "The scheduler tries to run each mapper on a machine that already stores its input block (putting the computation near the data). Jobs are often chained into workflows, each writing its output to files that the next one reads.",
      ],
      anchor: "Map emits pairs, shuffle groups by key, reduce combines.",
      terms: ["MapReduce", "mapper", "reducer", "shuffle", "HDFS"],
    },
    recall: {
      q: "What happens between map and reduce?",
      options: ["Pairs are sorted and grouped by key (the shuffle)", "Partial results are sent straight to users as soon as they're ready", "The input is deleted to free up the cluster", "Nothing; reducers read the raw input files"],
      answer: 0,
      why: "Each reducer gets all values for its keys.",
    },
    quiz: [
      {
        q: "A mapper is called:",
        options: ["Once per input record", "Once per distinct key", "Once per job", "Once per machine"],
        answer: 0,
        why: "It emits zero or more key-value pairs per record.",
      },
      {
        q: "Why run mappers where their input block is stored?",
        options: ["To avoid copying data over the network", "To use less memory on each machine", "So no one else can read that block", "So the output comes out already sorted"],
        answer: 0,
        why: "Moving computation is cheaper than moving data.",
      },
      {
        q: "To count words with MapReduce, the mapper emits:",
        options: ["(word, 1) for each word", "(1, word) for each word", "The total count for the file", "The whole document as one value"],
        answer: 0,
        why: "The reducer then sums the 1s for each word.",
      },
    ],
    scenario: {
      title: "A Thousand Ledgers", npc: "Royal Accountant", scene: "library",
      story: "Every town keeps its own sales ledger. I need total sales per product across all thousand towns.",
      ask: "How would MapReduce do it?",
      choices: [
        { text: "Map each sale to (product, amount); the shuffle groups by product; reduce sums each product.", correct: true, feedback: "Textbook MapReduce." },
        { text: "Copy all thousand ledgers to one desk and add them up there.", correct: false, feedback: "That desk becomes the bottleneck." },
        { text: "Map each town to its total sales, then split the totals across products by their prices.", correct: false, feedback: "You'd lose the real per-product breakdown." },
      ],
    },
  },
  {
    id: "10.3", chapter: 10, title: "Reduce-side joins & skew", needs: ["10.2"],
    card: {
      body: [
        "Joins in batch jobs scan whole datasets rather than looking up one row. In a sort-merge join, mappers read both inputs, say user activity events and user profiles, and emit records keyed by user ID.",
        "The shuffle brings every record for one user ID to the same reducer, with the profile first (a secondary sort). The reducer can then join each event to its profile without any network lookups.",
        "The same mechanism does GROUP BY. The trouble is skew: a 'hot key' such as a celebrity with millions of events sends all of them to one reducer, which becomes a straggler. A fix is to split hot keys over several reducers at random and replicate the matching profile to each.",
      ],
      anchor: "Bring same keys together; watch out for hot keys.",
      terms: ["sort-merge join", "secondary sort", "hot key", "straggler"],
    },
    recall: {
      q: "In a reduce-side join, what brings matching records together?",
      options: ["The shuffle, grouping by the join key", "A database lookup for every record", "Random assignment of records to reducers", "The client program after the job finishes"],
      answer: 0,
      why: "All records for one key reach the same reducer.",
    },
    quiz: [
      {
        q: "Why avoid looking up each user's profile in a remote database during the job?",
        options: ["Millions of network round trips would be slow and nondeterministic", "Batch frameworks don't allow mappers to open network connections", "The remote database doesn't store the users' profiles at all", "Mappers are not allowed to read anything besides their input"],
        answer: 0,
        why: "Bring the data into the job instead.",
      },
      {
        q: "A straggler reducer is usually caused by:",
        options: ["A hot key with far more records than others", "Too little memory on every machine in the cluster", "An input file that turned out to be empty", "Many small files instead of a few large ones"],
        answer: 0,
        why: "The job waits for its slowest task.",
      },
      {
        q: "One way to handle a hot key is to:",
        options: ["Spread its records over several reducers and replicate the other side", "Drop the hot key's records, since it's only one key out of millions", "Sort the hot key's records twice so the reducer can read them faster", "Run the whole job on a smaller cluster so there is less coordination"],
        answer: 0,
        why: "Parallelises the work for the hot key.",
      },
    ],
    scenario: {
      title: "The Famous Bard, Again", npc: "Royal Accountant", scene: "library",
      story: "My nightly join of fan letters to performer profiles finishes in 10 minutes, except one reducer, which takes 4 hours. Guess whose fan letters it handles.",
      ask: "What's the fix?",
      choices: [
        { text: "Split the bard's letters across several reducers and copy his profile to each.", correct: true, feedback: "Handles the skew from one hot key." },
        { text: "Add many more reducers overall, so each one has less to do and the slow one finishes sooner.", correct: false, feedback: "The bard's key still lands on one of them." },
        { text: "Run the job less often.", correct: false, feedback: "It would still take 4 hours." },
      ],
    },
  },
  {
    id: "10.4", chapter: 10, title: "Map-side joins", needs: ["10.3"],
    card: {
      body: [
        "If you know something about your inputs, you can join without the expensive sort and shuffle, entirely in the mappers.",
        "Broadcast hash join: when one input is small enough to fit in memory (say a table of 200 countries), every mapper loads it into a hash table and joins each big-input record by lookup.",
        "Partitioned hash join: if both inputs were already partitioned the same way (same key, same number of partitions), mapper 3 only needs partition 3 of each input. Map-side joins are faster, but they depend on those assumptions about size and layout.",
      ],
      anchor: "Small side in memory, or same partitions on both sides.",
      terms: ["broadcast hash join", "partitioned hash join", "map-side join"],
    },
    recall: {
      q: "A broadcast hash join needs:",
      options: ["One input small enough to fit in memory", "Both inputs already sorted by the join key, so they can be merged", "A separate reducer for every key", "A database to look up each record"],
      answer: 0,
      why: "Each mapper holds the small side as a hash table.",
    },
    quiz: [
      {
        q: "What do map-side joins avoid?",
        options: ["The sort and shuffle", "Reading the input", "Writing the output", "Using any memory"],
        answer: 0,
        why: "That's where their speed comes from.",
      },
      {
        q: "A partitioned hash join works when:",
        options: ["Both inputs are partitioned the same way by the join key", "One of the two inputs is completely empty", "Neither input is sorted in any particular order", "Both inputs are stored in a single partition"],
        answer: 0,
        why: "Each mapper reads matching partitions only.",
      },
      {
        q: "Joining 10 billion sales to a 200-row country table is a good fit for:",
        options: ["A broadcast hash join", "A reduce-side sort-merge join", "A cross join of both inputs", "A remote lookup per trade"],
        answer: 0,
        why: "200 rows fit easily in every mapper's memory.",
      },
    ],
    scenario: {
      title: "The Coin Table", npc: "Royal Accountant", scene: "library",
      story: "Each night I join 2 billion trades to a small table of 30 currencies to convert them to gold. The shuffle takes hours.",
      ask: "What do you suggest?",
      choices: [
        { text: "Load the 30 currencies into memory in every mapper and convert during the map phase.", correct: true, feedback: "A broadcast hash join: no shuffle needed." },
        { text: "Shuffle the 30 currencies to the reducers instead of shuffling the 2 billion trades.", correct: false, feedback: "A reduce-side join still shuffles both sides." },
        { text: "Look up each currency in the remote rates database, once for every single trade that comes in.", correct: false, feedback: "Two billion network calls." },
      ],
    },
  },
  {
    id: "10.5", chapter: 10, title: "Beyond MapReduce", needs: ["10.2"],
    card: {
      body: [
        "MapReduce writes every intermediate result to the distributed filesystem (materialization), replicated across machines. For long workflows that's a lot of wasted writing, and each job must wait for the previous one to finish entirely.",
        "Dataflow engines like Spark and Flink treat the whole workflow as one job: a graph of operators that pass data to each other, often in memory, and only sort when needed.",
        "They recover from failures by recomputing lost data from its inputs, which requires operators to be deterministic. Batch outputs are commonly search indexes, machine-learning features, or databases built from scratch and swapped in atomically, rather than writes straight into a live database.",
      ],
      anchor: "Pipe operators in memory; recompute what's lost.",
      terms: ["materialization", "dataflow engine", "Spark", "recomputation"],
    },
    recall: {
      q: "What's a main inefficiency of chaining MapReduce jobs?",
      options: ["Every intermediate result is written to the distributed filesystem", "Mappers can't sort their output before it reaches the reducers", "Reducers can't join two datasets in the same job", "It has no way to recover when a machine fails"],
      answer: 0,
      why: "Replicated writes of temporary data are expensive.",
    },
    quiz: [
      {
        q: "How do dataflow engines recover from a failed machine?",
        options: ["Recompute the lost data from its inputs", "Restart the entire cluster from scratch", "Skip the lost data and carry on", "Ask the user to rerun the job"],
        answer: 0,
        why: "This is why operators should be deterministic.",
      },
      {
        q: "Why should batch output usually not be written record by record into a live database?",
        options: ["It overloads the database and retries could cause partial writes", "Databases can't store data that was produced by batch jobs", "Writing output into a live database is forbidden by licences", "Batch output is always too small to be worth storing"],
        answer: 0,
        why: "Build a new dataset and swap it in instead.",
      },
      {
        q: "Spark and Flink treat a workflow as:",
        options: ["One graph of operators", "Many separate jobs", "A single SQL query", "A stream of files"],
        answer: 0,
        why: "That lets them pipeline data between steps.",
      },
    ],
    scenario: {
      title: "The Ten-Step Recipe", npc: "Royal Cook", scene: "bakery",
      story: "My nightly recipe has ten steps. After each one, every result is written into three cookbooks, just in case. It takes all night.",
      ask: "How can it be faster?",
      choices: [
        { text: "Run it as one dataflow: pass results between steps in memory, and redo a step from its inputs if something fails.", correct: true, feedback: "Skips the replicated intermediate writes." },
        { text: "Write each step into five cookbooks instead of three.", correct: false, feedback: "Even slower." },
        { text: "Skip the steps that seem unimportant tonight, and run the full recipe only at weekends when there's time.", correct: false, feedback: "The dessert would suffer." },
      ],
    },
  },
];
