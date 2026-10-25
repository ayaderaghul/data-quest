import type { Block } from "./types.js";

// Options are written with the correct answer first; the server shuffles them.
export const CH5: Block[] = [
  {
    id: "5.1", chapter: 5, title: "Leaders & followers", needs: [],
    card: {
      body: [
        "Replication keeps copies of the same data on several machines: to stay available when one dies, to serve reads closer to users, and to handle more reads.",
        "The most common setup is leader-based. All writes go to one node, the leader. It sends a stream of changes (the replication log) to the followers, which apply them in the same order. Reads can go to the leader or to any follower.",
        "To add a new follower: take a consistent snapshot of the leader, copy it over, then replay the log from the exact position where the snapshot was taken.",
      ],
      anchor: "One writes, many copy, all in the same order.",
      terms: ["leader", "follower", "replication log", "snapshot"],
    },
    recall: {
      q: "In leader-based replication, writes go to:",
      options: ["Only the leader", "Any follower", "The nearest replica", "All replicas at once"],
      answer: 0,
      why: "A single writer is what keeps the order consistent.",
    },
    quiz: [
      {
        q: "Which is NOT a usual reason to replicate?",
        options: ["To make every single write faster", "To keep serving if a machine dies", "To read from a copy close to users", "To spread read load over machines"],
        answer: 0,
        why: "Replication helps availability and reads; writes still go through the leader.",
      },
      {
        q: "How does a brand-new follower catch up?",
        options: ["Restore a snapshot, then replay the log from that point", "Copy the data files while the leader keeps accepting writes", "Ask clients to resend everything they wrote since yesterday", "Start empty and wait for keys to be written again"],
        answer: 0,
        why: "The snapshot's log position tells it where to resume.",
      },
      {
        q: "Followers apply changes:",
        options: ["In the same order the leader wrote them", "In whatever order the packets happen to arrive", "Sorted by key so lookups stay fast", "Grouped by client so each user's writes stay together"],
        answer: 0,
        why: "Same order means every replica ends up in the same state.",
      },
    ],
    scenario: {
      title: "The Far Provinces", npc: "Royal Treasurer", scene: "castle",
      story: "We keep one ledger in the capital. Provinces wait ages to read balances, and if the capital burns we lose everything.",
      ask: "What do you propose?",
      choices: [
        { text: "Keep the capital as leader and add read-only follower copies in the provinces.", correct: true, feedback: "Faster local reads and a copy that survives the fire." },
        { text: "Let every province keep its own ledger and settle up with the capital once a year at the harvest festival.", correct: false, feedback: "Balances would disagree within a day." },
        { text: "Build one bigger ledger in the capital with more clerks to read it out.", correct: false, feedback: "Still one copy, and still far away." },
      ],
    },
  },
  {
    id: "5.2", chapter: 5, title: "Sync, async & failover", needs: ["5.1"],
    card: {
      body: [
        "Synchronous replication: the leader waits for a follower to confirm before telling the client 'done'. The follower is guaranteed up to date, but if it stalls, all writes stall. Asynchronous: the leader doesn't wait. Fast, but a write confirmed to the client can be lost if the leader dies.",
        "Many systems are semi-synchronous: one follower is synchronous, the rest asynchronous, so there are always at least two up-to-date copies.",
        "When the leader dies, failover promotes a follower. Dangers: async writes the new leader never received are lost, and the old leader may come back still thinking it's in charge. Two leaders at once is called split brain.",
      ],
      anchor: "Sync: safe but waits. Async: fast but can forget.",
      terms: ["synchronous", "asynchronous", "semi-synchronous", "failover", "split brain"],
    },
    recall: {
      q: "With async replication, a confirmed write can be lost when:",
      options: ["The leader fails before followers receive it", "A new follower is added while it's in flight", "Another client reads it from a follower", "The network is fast and nothing goes wrong"],
      answer: 0,
      why: "The client got 'done' while the write still existed only on the leader.",
    },
    quiz: [
      {
        q: "Semi-synchronous replication means:",
        options: ["One follower is sync, the others async", "Every other write is replicated synchronously", "Followers sync at night and run async by day", "Followers take turns acting as the leader"],
        answer: 0,
        why: "It guarantees two current copies without one slow node blocking all writes.",
      },
      {
        q: "Split brain is:",
        options: ["Two nodes both believing they are the leader", "A follower falling far behind the leader", "The network splitting the cluster into halves", "A leader writing to two partitions at once"],
        answer: 0,
        why: "Both accept writes, so the data diverges.",
      },
      {
        q: "Why not make every follower synchronous?",
        options: ["Any one slow or dead follower would block all writes", "It would use far more disk space on each follower", "Synchronous replication is only allowed between datacenters", "Followers can't send confirmations back to the leader"],
        answer: 0,
        why: "Availability of writes would depend on the slowest node.",
      },
    ],
    scenario: {
      title: "Two Commanders", npc: "Fortress Commander", scene: "castle",
      story: "Our leader crashed. The follower we promoted was 2 seconds behind, so some confirmed orders vanished. Then the old leader came back and kept accepting writes.",
      ask: "What should we fix?",
      choices: [
        { text: "Fence off the old leader so it can't accept writes, and keep one sync follower for failover.", correct: true, feedback: "Prevents split brain and keeps a fully current copy ready." },
        { text: "Let both leaders run and merge their records by hand at the end of the week.", correct: false, feedback: "Manual merges of diverged data are slow and error-prone." },
        { text: "Never fail over; wait for the old leader to be repaired.", correct: false, feedback: "That turns every crash into downtime." },
      ],
    },
  },
  {
    id: "5.3", chapter: 5, title: "Replication lag", needs: ["5.1", "5.2"],
    card: {
      body: [
        "With async replication, a follower applies the leader's writes a little later. Read from that follower right then and you may see old data. The delay is the replication lag.",
        "Normally lag is a fraction of a second. Under heavy load or network trouble it can grow to seconds or even minutes.",
        "This is eventual consistency: if writes stop, the followers eventually catch up. 'Eventually' comes with no upper bound, so applications have to plan for stale reads.",
      ],
      anchor: "'Eventually consistent' just means 'eventually'.",
      terms: ["replication lag", "stale read", "eventual consistency"],
    },
    recall: {
      q: "A read from a lagging follower may return:",
      options: ["Stale (old) data", "An error every time", "Data that isn't written yet", "Nothing at all"],
      answer: 0,
      why: "The follower hasn't applied the latest writes yet.",
    },
    quiz: [
      {
        q: "Follower B is 3s behind. A client writes v=42 to the leader, then reads from B right away. It sees:",
        options: ["The old value", "v=42, the new value", "An error saying the data is stale", "It waits until the follower catches up"],
        answer: 0,
        why: "B hasn't applied the write, and async followers don't block reads.",
      },
      {
        q: "Replication lag usually grows when:",
        options: ["The system is overloaded or the network is slow", "Users log out and their sessions are cleaned up", "The disk on the follower is almost empty", "Writes stop arriving at the leader"],
        answer: 0,
        why: "Followers can't keep up with the change stream.",
      },
      {
        q: "Eventual consistency guarantees:",
        options: ["Replicas converge if writes stop, with no time bound", "Every read returns the latest write within one second", "Replication lag never exceeds a configured limit", "Concurrent writes can never conflict with each other"],
        answer: 0,
        why: "It's a promise about the end state, not about timing.",
      },
    ],
    scenario: {
      title: "The Vanishing Order", npc: "Nonna Pina, baker", scene: "bakery",
      story: "I put in an order for 40 focaccia. I refreshed the page and it was gone! I placed it again, and now there are two.",
      ask: "What do you tell her?",
      choices: [
        { text: "Her refresh hit a lagging follower. Read her own orders from the leader for a minute after she writes.", correct: true, feedback: "Right. That's the read-your-writes fix you'll meet in 5.4." },
        { text: "The leader lost her write. Restart it and ask her to order again.", correct: false, feedback: "The write is safe on the leader. The follower just hadn't caught up." },
        { text: "Switch every follower to synchronous replication so nobody ever sees old data again.", correct: false, feedback: "One slow follower would then block every write in the bakery." },
      ],
    },
  },
  {
    id: "5.4", chapter: 5, title: "Read-your-writes & friends", needs: ["5.3"],
    card: {
      body: [
        "Replication lag causes three classic anomalies, each with its own fix.",
        "Read-your-writes: after you submit something, you should see it when you reload. Fix: read things the user may have edited from the leader, or track the user's last write time and only use followers that have caught up to it.",
        "Monotonic reads: you shouldn't see newer data and then older data on the next refresh. Fix: always send a user to the same replica, e.g. chosen by a hash of their ID. Consistent prefix reads: writes should appear in an order that makes sense, so an answer never shows up before its question.",
      ],
      anchor: "See your own writes, never go back in time, keep cause before effect.",
      terms: ["read-your-writes", "monotonic reads", "consistent prefix reads"],
    },
    recall: {
      q: "Always routing a user to the same replica guarantees:",
      options: ["Monotonic reads", "Read-your-writes", "Linearizability", "Consistent prefix reads"],
      answer: 0,
      why: "One replica only moves forward, so the user never sees time go backwards.",
    },
    quiz: [
      {
        q: "A comment appears, then disappears on the next refresh. Which guarantee broke?",
        options: ["Monotonic reads", "Read-your-writes", "Consistent prefix reads", "Durability"],
        answer: 0,
        why: "The second read came from a replica further behind than the first.",
      },
      {
        q: "A fix for read-your-writes is:",
        options: ["Read data the user may have edited from the leader", "Add more followers so one is more likely to be fresh", "Disable the browser cache on every page", "Serve the user's pages from a CDN near them"],
        answer: 0,
        why: "The leader always has the user's own latest writes.",
      },
      {
        q: "Seeing an answer before its question breaks:",
        options: ["Consistent prefix reads", "Monotonic reads", "Read-your-writes", "Atomicity"],
        answer: 0,
        why: "Causally related writes arrived out of order.",
      },
    ],
    scenario: {
      title: "The Gossip's Puzzle", npc: "Village Gossip", scene: "market",
      story: "I saw Bea's reply 'Yes, Sunday!' before I could see Tom's question 'Party when?'",
      ask: "What went wrong?",
      choices: [
        { text: "Causally related writes were read out of order. Keep them on the same partition so they stay in order.", correct: true, feedback: "That's how you get consistent prefix reads." },
        { text: "Tom should post faster.", correct: false, feedback: "He posted first. The reads were out of order." },
        { text: "Add more followers so every reader gets a fresher copy of the messages.", correct: false, feedback: "More replicas give more chances to read out of order." },
      ],
    },
  },
  {
    id: "5.5", chapter: 5, title: "Multi-leader", needs: ["5.1"],
    card: {
      body: [
        "Multi-leader replication lets more than one node accept writes. Each leader also acts as a follower of the others.",
        "Use cases: several datacenters (each region has a local leader, so writes are fast and survive a whole datacenter going down), offline clients (every phone with an offline calendar is effectively a leader), and real-time collaborative editing.",
        "The big cost: two leaders can accept conflicting writes to the same data at the same time. Inside a single datacenter, the extra complexity is rarely worth it.",
      ],
      anchor: "More leaders, more speed, more conflicts.",
      terms: ["multi-leader", "multi-datacenter", "offline client", "write conflict"],
    },
    recall: {
      q: "The main new problem in multi-leader replication is:",
      options: ["Write conflicts", "Slower reads", "No way to back up", "Too few replicas"],
      answer: 0,
      why: "Two places can change the same record concurrently.",
    },
    quiz: [
      {
        q: "A calendar app that works offline on each device is effectively:",
        options: ["Multi-leader", "Single-leader", "Leaderless with quorums", "Not replicated at all"],
        answer: 0,
        why: "Each device accepts writes locally and syncs later.",
      },
      {
        q: "An advantage of one leader per datacenter is:",
        options: ["Writes go to a nearby leader and survive a datacenter outage", "Conflicts become impossible because each region has its own data", "Reads always see the latest write from every region", "No network link between the datacenters is needed any more"],
        answer: 0,
        why: "Local writes are fast; other regions keep working if one fails.",
      },
      {
        q: "Inside a single datacenter, multi-leader is usually:",
        options: ["Not worth the complexity", "Required for fault tolerance", "Faster than any other setup", "The default in most databases"],
        answer: 0,
        why: "Its benefits come from distance and disconnection.",
      },
    ],
    scenario: {
      title: "Two Castles", npc: "King of Two Castles", scene: "harbor",
      story: "Castelfranco and Hai Phong castles both need fast writes, even when the sea route between them is down.",
      ask: "How should we replicate?",
      choices: [
        { text: "A leader in each castle, syncing with each other, plus a conflict strategy.", correct: true, feedback: "Local writes, survives the sea route failing. Just plan for conflicts." },
        { text: "One leader in Castelfranco; Hai Phong waits until the sea route is repaired before writing anything.", correct: false, feedback: "Hai Phong can't write whenever the link is down." },
        { text: "Two separate databases that never sync.", correct: false, feedback: "Then they're two kingdoms, not one." },
      ],
    },
  },
  {
    id: "5.6", chapter: 5, title: "Write conflicts", needs: ["5.5"],
    card: {
      body: [
        "If two leaders change the same record at the same time, every replica must still end up with the same final value. There are several strategies.",
        "Avoid conflicts: send all writes for a record to the same home leader. Last write wins (LWW): attach a timestamp and keep the latest, which is simple but silently throws away the other writes. Merge: combine values, for example the union of shopping-cart items. Or keep all versions and let the app or the user resolve them.",
        "CRDTs are data types designed to merge concurrent changes automatically, such as counters and sets.",
      ],
      anchor: "Converge or diverge: every conflict needs a rule.",
      terms: ["conflict avoidance", "last write wins", "merge", "CRDT"],
    },
    recall: {
      q: "Last write wins risks:",
      options: ["Silently losing concurrent writes", "Crashing the leader that lost", "Replicas never agreeing again", "Duplicating every record"],
      answer: 0,
      why: "Only one of the concurrent writes survives.",
    },
    quiz: [
      {
        q: "The simplest way to avoid conflicts is to:",
        options: ["Send all writes for a record to one home leader", "Add more leaders so each one handles fewer writes", "Compare timestamps and keep the most recent write", "Pause writes to a record while anyone is reading it"],
        answer: 0,
        why: "If one leader owns the record, there's nothing concurrent to resolve.",
      },
      {
        q: "CRDTs are:",
        options: ["Data structures that merge concurrent changes automatically", "A consensus algorithm used to elect a single leader", "Encryption keys shared between the leaders", "A log format for replicating writes between regions"],
        answer: 0,
        why: "They're designed so that merging in any order gives the same result.",
      },
      {
        q: "Two users rename a wiki page to 'B' and 'C' at the same time. With LWW:",
        options: ["One edit is kept, the other silently lost", "Both titles are kept, joined together", "The page is reverted to its old title", "Both users are asked to choose one"],
        answer: 0,
        why: "The later timestamp wins and the other write disappears.",
      },
    ],
    scenario: {
      title: "The Last Basket of Figs", npc: "Market Clerk", scene: "market",
      story: "Two stalls sold the last basket of figs at the same moment, on different leaders.",
      ask: "How do we stop this happening again?",
      choices: [
        { text: "Give each item's stock one home leader so sales can't conflict.", correct: true, feedback: "Conflict avoidance: the simplest strategy that works." },
        { text: "Last write wins: whoever's timestamp is later keeps the figs, the other sale disappears.", correct: false, feedback: "One customer paid for figs that silently vanish from the record." },
        { text: "Ignore it; figs are cheap.", correct: false, feedback: "Next time it's the last horse." },
      ],
    },
  },
  {
    id: "5.7", chapter: 5, title: "Leaderless & quorums", needs: ["5.3", "5.6"],
    card: {
      body: [
        "In leaderless replication (Dynamo-style, e.g. Cassandra), the client sends each write to several replicas directly, and any replica can accept it. Reads also query several replicas and use version numbers to pick the newest value.",
        "With n replicas, a write must be confirmed by w of them and a read must query r. If w + r > n, the set you write to and the set you read from overlap, so at least one replica you read has the latest value. A common choice is n=3, w=2, r=2.",
        "Stale replicas are fixed by read repair (a reader writes the newer value back) and anti-entropy (background syncing). Quorums still have edge cases, such as concurrent writes.",
      ],
      anchor: "w + r > n: the sets must overlap.",
      terms: ["leaderless", "quorum", "w + r > n", "read repair", "anti-entropy"],
    },
    recall: {
      q: "With n=3, which (w, r) guarantees overlap?",
      options: ["w=2, r=2", "w=1, r=1", "w=1, r=2", "w=0, r=3"],
      answer: 0,
      why: "2 + 2 = 4 > 3. The others sum to 3 or less.",
    },
    quiz: [
      {
        q: "n=5 and w=3. What's the minimum r for overlap?",
        options: ["3", "2", "1", "5"],
        answer: 0,
        why: "You need w + r > 5, so r ≥ 3.",
      },
      {
        q: "Read repair means:",
        options: ["A reader that sees a stale replica writes the newer value back", "A background job that compares every replica once a night", "Deleting a stale replica and rebuilding it from scratch", "Asking the client to retry the read on a different replica"],
        answer: 0,
        why: "It fixes stale replicas as a side effect of reads.",
      },
      {
        q: "With n=3, w=2, r=2, how many replicas can be down and writes still succeed?",
        options: ["1", "0", "2", "3"],
        answer: 0,
        why: "Two of three must confirm, so one can be unavailable.",
      },
    ],
    scenario: {
      title: "The Three Towers", npc: "Council of Three Towers", scene: "castle",
      story: "Each tower keeps a copy of the census. We write to one tower and read from one tower, and we keep reading old counts.",
      ask: "What should we change?",
      choices: [
        { text: "Write to two towers and read from two, so w + r > n.", correct: true, feedback: "Now every read overlaps with the latest write." },
        { text: "Keep writing to one tower and reading from one, but use faster horses between them.", correct: false, feedback: "Speed doesn't fix non-overlapping sets." },
        { text: "Use only one tower.", correct: false, feedback: "Then losing that tower loses the census." },
      ],
    },
  },
];
