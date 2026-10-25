import type { Block } from "./types.js";

// Options are written with the correct answer first; the server shuffles them.
export const CH12: Block[] = [
  {
    id: "12.1", chapter: 12, title: "Data integration & derived data", needs: [],
    card: {
      body: [
        "No single tool does everything well, so real applications combine several: a database, a search index, a cache, a warehouse, a recommendation system. The hard part is keeping them consistent.",
        "The book's answer: pick one system of record and treat everything else as derived data, computed from it by batch or stream processing. If an index is wrong, you can throw it away and rebuild it from the source.",
        "Feeding all derived systems from one ordered log of changes means they apply writes in the same order. Derived data also makes evolution easier: build a new view next to the old one, then gradually move readers over.",
      ],
      anchor: "One source of truth; everything else is derived and rebuildable.",
      terms: ["system of record", "derived data", "data integration"],
    },
    recall: {
      q: "Derived data is:",
      options: ["Data computed from a system of record, which can be rebuilt", "The original source of truth that everything else is checked against", "Data typed in by users through forms in the application", "Backup copies that are only read after a disaster"],
      answer: 0,
      why: "Indexes, caches and views are derived.",
    },
    quiz: [
      {
        q: "Why feed derived systems from one ordered log rather than dual writes?",
        options: ["They all apply changes in the same order", "It uses less disk space on each system", "Logs are encrypted, so data stays private", "It takes less code to write than dual writes"],
        answer: 0,
        why: "Same order, same final state.",
      },
      {
        q: "A big advantage of derived views is that you can:",
        options: ["Build a new view beside the old one and migrate gradually", "Never have to change the schema of the system of record", "Skip backups, since every view can always be rebuilt", "Avoid writing any code to keep the views up to date"],
        answer: 0,
        why: "Evolution without a risky big-bang migration.",
      },
      {
        q: "If a search index gets corrupted, the derived-data approach says:",
        options: ["Rebuild it from the system of record", "Restore it by hand from old backups", "Delete the source data so they match", "Live with it until it's noticed"],
        answer: 0,
        why: "The source of truth makes derived data disposable.",
      },
    ],
    scenario: {
      title: "Five Ledgers", npc: "Royal Treasurer", scene: "castle",
      story: "We keep the same accounts in five places: the treasury, a summary scroll, a search book, a daily report and the tax office. They never agree.",
      ask: "What's the fix?",
      choices: [
        { text: "Make the treasury the system of record and derive the other four from its change log.", correct: true, feedback: "One source, ordered changes, rebuildable views." },
        { text: "Hire a clerk to sync all five ledgers by hand every Friday.", correct: false, feedback: "They'll disagree for six days a week." },
        { text: "Let each office decide which numbers are right for its own purposes, and stop comparing them.", correct: false, feedback: "That's how you got five truths." },
      ],
    },
  },
  {
    id: "12.2", chapter: 12, title: "Unbundling the database", needs: ["12.1"],
    card: {
      body: [
        "Inside one database, features like secondary indexes, materialized views and replication logs are all ways of deriving data from writes. 'Unbundling' means doing the same thing across many specialised tools.",
        "Think of the whole system as a dataflow: writes go into a log, and stream processors keep indexes, caches and views up to date, much as a spreadsheet recalculates cells when inputs change.",
        "You can push this all the way to the client: instead of the user's screen polling for changes, the server streams state changes to it, so the screen becomes one more derived view kept up to date.",
      ],
      anchor: "The whole system is one big spreadsheet of derived views.",
      terms: ["unbundling", "dataflow", "materialized view"],
    },
    recall: {
      q: "'Unbundling the database' means:",
      options: ["Composing specialised tools the way a database composes its internal features", "Splitting one large database into many smaller databases, one per team", "Removing the indexes and views from a database to make writes faster", "Replacing the database with files stored in a distributed filesystem"],
      answer: 0,
      why: "Logs and stream processors play the role of internal machinery.",
    },
    quiz: [
      {
        q: "A secondary index inside a database is an example of:",
        options: ["Derived data maintained from writes", "The system of record itself", "A backup of the table", "A cache with no source"],
        answer: 0,
        why: "Unbundling does the same across systems.",
      },
      {
        q: "The spreadsheet analogy means:",
        options: ["When inputs change, dependent views update automatically", "All data is stored in rows and columns of cells", "Everything must fit on a single machine", "Users edit the data directly in the views"],
        answer: 0,
        why: "Dataflow recomputes what depends on the change.",
      },
      {
        q: "Extending dataflow to the client means:",
        options: ["The server pushes state changes to the screen", "The screen asks the server for updates every second", "Clients write their changes straight into the log", "Clients keep the system of record on the device"],
        answer: 0,
        why: "The UI becomes another derived view.",
      },
    ],
    scenario: {
      title: "The Mayor's Dashboard", npc: "Mayor", scene: "market",
      story: "My dashboard reloads the whole town database every 10 seconds to see if anything changed. The database groans.",
      ask: "What's the dataflow way?",
      choices: [
        { text: "Subscribe the dashboard to the change stream so updates are pushed as they happen.", correct: true, feedback: "The dashboard becomes a derived view." },
        { text: "Reload the whole database every second instead.", correct: false, feedback: "Ten times the groaning." },
        { text: "Reload once a day, early in the morning when the town is still asleep and the database is quiet.", correct: false, feedback: "Fresh data was the point." },
      ],
    },
  },
  {
    id: "12.3", chapter: 12, title: "End-to-end & idempotence", needs: ["12.1"],
    card: {
      body: [
        "Even with transactions and exactly-once processing, duplicates can sneak in end to end. A user taps 'pay', the network times out, and the app retries. The database saw two separate requests, both perfectly valid.",
        "The end-to-end argument: some guarantees can only be implemented correctly at the endpoints of the system. Lower layers like TCP or the database help, but they can't know that two requests are the same operation.",
        "The fix is to generate a unique request ID at the start (on the client) and pass it all the way through. The server records processed IDs and ignores repeats, making the whole operation idempotent.",
      ],
      anchor: "Name the request at the edge; dedupe all the way down.",
      terms: ["end-to-end argument", "request ID", "idempotence", "deduplication"],
    },
    recall: {
      q: "The end-to-end argument says some guarantees:",
      options: ["Can only be fully implemented at the endpoints of the system", "Belong to the network layer and should be handled by TCP", "Come for free once every component uses transactions", "Matter only for systems that run in a single datacenter"],
      answer: 0,
      why: "Only the endpoints know two requests are one intent.",
    },
    quiz: [
      {
        q: "Where should the unique request ID be generated?",
        options: ["At the client, when the operation starts", "In the database, right after the insert", "At the load balancer, for each request", "Freshly on every retry, to stay unique"],
        answer: 0,
        why: "Retries must carry the same ID.",
      },
      {
        q: "Can database transactions alone stop a double payment from a retried request?",
        options: ["No, each retry is a separate valid transaction", "Yes, transactions always detect duplicate requests", "Only if the database uses two-phase commit", "Only if the data is stored on a single node"],
        answer: 0,
        why: "The database can't tell the two apart.",
      },
      {
        q: "The server makes the operation idempotent by:",
        options: ["Recording processed request IDs and ignoring repeats", "Processing every request slowly so retries arrive late", "Telling clients never to retry a failed request", "Asking the user to confirm each payment twice"],
        answer: 0,
        why: "The second copy has no effect.",
      },
    ],
    scenario: {
      title: "The Double Dowry", npc: "Royal Banker", scene: "castle",
      story: "The duke sent a dowry payment. The courier got no receipt, so a second courier was sent. The bride's family was paid twice.",
      ask: "How do we prevent this for good?",
      choices: [
        { text: "Every payment order carries a unique seal; the bank refuses a seal it has already honoured.", correct: true, feedback: "A request ID checked end to end." },
        { text: "Never send a second courier.", correct: false, feedback: "Then lost orders are never paid." },
        { text: "Use faster couriers on better horses so the receipt always comes back before anyone worries about it.", correct: false, feedback: "Receipts can still get lost." },
      ],
    },
  },
  {
    id: "12.4", chapter: 12, title: "Timeliness vs integrity", needs: ["12.3"],
    card: {
      body: [
        "'Consistency' mixes two different needs. Timeliness: users see up-to-date state. Integrity: no corruption, no lost or contradictory data.",
        "Violations of timeliness are temporary: wait a bit and the view catches up (eventual consistency). Violations of integrity are permanent: a corrupted account balance stays wrong. In most apps, integrity matters much more.",
        "Dataflow systems can guarantee integrity without coordinating every write: ordered logs, deterministic derivations and end-to-end request IDs keep data correct, while views catch up asynchronously. Some constraints can even be checked afterwards and fixed with an apology, as businesses already do with overbooked flights.",
      ],
      anchor: "Late is fixable; corrupt is forever.",
      terms: ["timeliness", "integrity", "coordination-avoiding", "apology"],
    },
    recall: {
      q: "Which violation is usually worse?",
      options: ["An integrity violation", "A timeliness violation", "Both are equally bad", "Neither one matters"],
      answer: 0,
      why: "Stale data heals itself; corrupt data doesn't.",
    },
    quiz: [
      {
        q: "A view showing your payment a few seconds late is a breach of:",
        options: ["Timeliness", "Integrity", "Durability", "Atomicity"],
        answer: 0,
        why: "It will catch up.",
      },
      {
        q: "Coordination-avoiding systems keep integrity by:",
        options: ["Ordered logs, deterministic processing and request IDs", "Locking every row globally before any write is allowed", "Ignoring failures and hoping they cancel each other out", "Running the whole system on a single, very large machine"],
        answer: 0,
        why: "Correctness without synchronous coordination.",
      },
      {
        q: "'Check afterwards and apologise' works for constraints that:",
        options: ["Are cheap to fix if broken occasionally, like overbooking", "Protect people's physical safety, like aircraft controls", "Can never be undone once they've been broken, like deletions", "Involve secrets, like checking passwords at login"],
        answer: 0,
        why: "Businesses already compensate for rare violations.",
      },
    ],
    scenario: {
      title: "The Oversold Inn", npc: "Innkeeper", scene: "market",
      story: "Booking across three towns needs a slow global lock, so guests wait minutes to reserve. Overbooking would only happen about once a month.",
      ask: "What's a reasonable design?",
      choices: [
        { text: "Accept bookings quickly, detect the rare overbooking afterwards, and apologise with a free upgrade.", correct: true, feedback: "Integrity of the records holds; the rare conflict is compensated." },
        { text: "Keep the global lock and the angry queue.", correct: false, feedback: "Pays a high price every time for a rare problem." },
        { text: "Let each town take bookings freely and never check across towns, since overbooking is so rare anyway.", correct: false, feedback: "Without detection, it's chaos." },
      ],
    },
  },
  {
    id: "12.5", chapter: 12, title: "Trust, verify & do right", needs: ["12.4"],
    card: {
      body: [
        "Hardware and software both have bugs, and data gets corrupted in ways nobody expected. Rather than blindly trusting the system, build in auditing: periodically check that derived data still matches its source, and that backups actually restore. Immutable event logs make this much easier.",
        "The book ends with ethics. Systems built on personal data affect real people: predictive analytics can decide who gets a loan or a job, and bias in the data becomes bias in the decision, with no one accountable.",
        "Collecting everything 'just in case' turns into surveillance. Treat data as a liability as well as an asset: collect what you need, explain how it's used, keep it no longer than necessary, and give people control.",
      ],
      anchor: "Audit your data; respect the people behind it.",
      terms: ["auditing", "data integrity checks", "predictive analytics", "surveillance", "privacy"],
    },
    recall: {
      q: "'Trust, but verify' means:",
      options: ["Regularly check that data and backups are actually correct", "Never trust any data until it has been entered twice", "Trust users completely, since they know their own data", "Verify passwords at login, and trust everything after"],
      answer: 0,
      why: "Corruption is found only if you look for it.",
    },
    quiz: [
      {
        q: "Why do immutable event logs help auditing?",
        options: ["You can replay them to check that derived state is right", "They take up much less space than a regular database", "They encrypt all data automatically as it's written", "They prevent bugs from ever reaching production"],
        answer: 0,
        why: "You can recompute and compare.",
      },
      {
        q: "A risk of predictive analytics in decisions like loans is:",
        options: ["Bias in the data becomes unfair, unaccountable decisions", "The models are too slow to answer in real time", "They need far too much disk space to train", "They're forbidden by law in every country"],
        answer: 0,
        why: "Algorithms can launder existing discrimination.",
      },
      {
        q: "Which practice fits the book's view on privacy?",
        options: ["Collect only what you need and delete it when no longer needed", "Keep everything forever, just in case it becomes useful one day", "Sell the data to partners to cover the cost of storing it", "Keep how the data is used private so nobody can misuse that knowledge"],
        answer: 0,
        why: "Data is a liability as well as an asset.",
      },
    ],
    scenario: {
      title: "The Kingdom's Ledger", npc: "Chancellor", scene: "castle",
      story: "The new tax scroll predicts who will avoid taxes, from where they live and who their friends are. It also keeps everyone's travels forever, just in case.",
      ask: "What would a wise data engineer say?",
      choices: [
        { text: "Check the predictions for bias and accountability, collect only what's needed, and stop keeping travels forever.", correct: true, feedback: "That's the book's closing message." },
        { text: "Collect even more data to make the predictions better.", correct: false, feedback: "More data can mean more bias and more surveillance." },
        { text: "It's just mathematics applied to the kingdom's own records, so its predictions must be fair and should be trusted.", correct: false, feedback: "Math applied to biased data stays biased." },
      ],
    },
  },
];
