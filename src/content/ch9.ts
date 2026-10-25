import type { Block } from "./types.js";

// Options are written with the correct answer first; the server shuffles them.
export const CH9: Block[] = [
  {
    id: "9.1", chapter: 9, title: "Linearizability", needs: [],
    card: {
      body: [
        "Linearizability (also called strong consistency or atomic consistency) makes a replicated system behave as if there were only one copy of the data, and every operation took effect at a single instant.",
        "The key promise is recency: once any read has returned a new value, every later read, by anyone, must return that value or a newer one. Nobody can ever 'go back' to the old value.",
        "It's what you need for things like leader election locks, uniqueness constraints (two people can't claim the same username) and cross-channel timing, such as a file upload followed by a message telling another service to process it.",
      ],
      anchor: "Act as if there's one copy, and never go back in time.",
      terms: ["linearizability", "recency guarantee", "strong consistency"],
    },
    recall: {
      q: "Linearizability guarantees that:",
      options: ["Once a new value is read, no later read returns an older one", "Every read is served in under a millisecond, from any replica", "Two writes to the same key can never conflict with each other", "Every node's clock agrees on the time of every operation"],
      answer: 0,
      why: "That's the recency guarantee.",
    },
    quiz: [
      {
        q: "Which use case needs linearizability?",
        options: ["Ensuring a username is claimed only once", "Counting page views to within a few percent", "Showing a user their posts from last year", "Caching thumbnails close to the user"],
        answer: 0,
        why: "Uniqueness needs one agreed, up-to-date answer.",
      },
      {
        q: "Is a single-leader system with reads from async followers linearizable?",
        options: ["No, a follower can return stale data", "Yes, because all writes go through one leader", "Yes, as long as there's only one datacenter", "Only for writes, never for reads"],
        answer: 0,
        why: "Replication lag breaks the recency guarantee.",
      },
      {
        q: "Another name often used for linearizability is:",
        options: ["Strong consistency", "Eventual consistency", "Snapshot isolation", "Read committed"],
        answer: 0,
        why: "Also called atomic consistency.",
      },
    ],
    scenario: {
      title: "The Double-Sold Seat", npc: "Theatre Owner", scene: "market",
      story: "Two buyers on different servers both saw seat 12 as free and both got a ticket.",
      ask: "What guarantee was missing?",
      choices: [
        { text: "Linearizability: claiming the seat must act on a single, up-to-date copy.", correct: true, feedback: "A uniqueness constraint needs it." },
        { text: "Faster servers, so a seat is marked as sold before anyone else can look at it.", correct: false, feedback: "Speed doesn't stop two stale reads." },
        { text: "Snapshot isolation on each server.", correct: false, feedback: "Each server's snapshot can still be stale." },
      ],
    },
  },
  {
    id: "9.2", chapter: 9, title: "The cost: CAP and latency", needs: ["9.1"],
    card: {
      body: [
        "If the network splits the replicas, a linearizable system must choose. Either replicas that can't reach the others refuse requests (consistent but unavailable), or they keep answering with possibly stale data (available but not linearizable).",
        "That's the real content of the CAP theorem: when a network Partition happens, choose Consistency or Availability. Since partitions aren't optional, 'pick two of three' is misleading.",
        "Even without faults, linearizability is slow: every operation needs coordination, so response times grow with network delays. Many systems drop it for performance, not just for fault tolerance.",
      ],
      anchor: "When the network splits, choose: answer or be right.",
      terms: ["CAP theorem", "network partition", "availability"],
    },
    recall: {
      q: "The CAP theorem really says:",
      options: ["During a network partition, choose consistency or availability", "Always pick any two of consistency, availability and partitions", "Partitions are rare, so you can usually have all three", "Availability is always lost when a single node crashes"],
      answer: 0,
      why: "Partitions happen whether you like it or not.",
    },
    quiz: [
      {
        q: "A partitioned linearizable replica that can't reach the others should:",
        options: ["Refuse requests or wait", "Answer with whatever data it has locally", "Elect itself leader and carry on", "Delete its data to avoid conflicts"],
        answer: 0,
        why: "Answering could return stale data and break the guarantee.",
      },
      {
        q: "Besides fault tolerance, many systems skip linearizability because of:",
        options: ["Performance: it adds latency to every operation", "Licensing: linearizable databases are usually expensive", "Storage: every replica needs twice the disk space", "Security: coordination messages can leak data"],
        answer: 0,
        why: "Coordination costs round trips.",
      },
      {
        q: "Why is 'pick 2 of 3' misleading?",
        options: ["Partitions will happen, so you're really choosing C or A when they do", "There are really four properties, and the fourth is latency", "Availability comes for free once you have consistency", "Consistency is impossible to achieve in any real system"],
        answer: 0,
        why: "You can't choose to have no partitions.",
      },
    ],
    scenario: {
      title: "The Broken Bridge", npc: "Bridge Warden", scene: "harbor",
      story: "The bridge to the east bank collapsed. The east bank's ledger can't reach the west bank's. Merchants still want to trade.",
      ask: "If the ledger must never sell the same goods twice, what should the east bank do?",
      choices: [
        { text: "Refuse sales until the bridge is repaired.", correct: true, feedback: "Consistency over availability during the partition." },
        { text: "Keep selling and hope the goods aren't sold twice.", correct: false, feedback: "That's availability, and double sales." },
        { text: "Both banks keep selling, then compare their ledgers and argue it out once the bridge is rebuilt.", correct: false, feedback: "That breaks the never-twice rule." },
      ],
    },
  },
  {
    id: "9.3", chapter: 9, title: "Ordering & causality", needs: ["9.1"],
    card: {
      body: [
        "Causality says some events must come before others: a question before its answer, a row's creation before its update. If B depends on A, everyone should see A first. Events that don't know about each other are concurrent.",
        "Causal consistency preserves that order without forcing a single global order on everything. It's the strongest model that can stay available during network partitions, and it's cheaper than linearizability.",
        "To track causality, a system needs to know which version of the data each operation had seen, for example with version vectors.",
      ],
      anchor: "Cause before effect; concurrent things can go either way.",
      terms: ["causality", "happens-before", "causal consistency", "concurrent"],
    },
    recall: {
      q: "Two events are concurrent when:",
      options: ["Neither knew about the other", "They happened in the same millisecond", "They happened on the same node", "One of them caused the other"],
      answer: 0,
      why: "It's about knowledge, not clock time.",
    },
    quiz: [
      {
        q: "Causal consistency, compared to linearizability, is:",
        options: ["Weaker but can stay available during partitions", "Stronger, and slower because it orders everything", "Exactly the same guarantee under a different name", "Impossible to implement without synchronized clocks"],
        answer: 0,
        why: "It only orders related events.",
      },
      {
        q: "Which pair is causally related?",
        options: ["Creating a row, then updating it", "Two users posting unrelated messages", "Two independent sensor readings", "Two reads of different keys"],
        answer: 0,
        why: "The update depends on the row existing.",
      },
      {
        q: "To track causality, a system must know:",
        options: ["Which data each operation had seen", "The wall-clock time of every operation", "The IP address of the node that wrote it", "How many replicas each record has"],
        answer: 0,
        why: "Version vectors are one way to record it.",
      },
    ],
    scenario: {
      title: "The Answer Before the Question", npc: "Village Gossip", scene: "market",
      story: "Again! On one replica I saw 'Yes, Sunday!' before 'Party when?'",
      ask: "What guarantee would fix this, without making everything slow?",
      choices: [
        { text: "Causal consistency: a reply is never shown before the message it answers.", correct: true, feedback: "Orders cause and effect only, so it stays fast and available." },
        { text: "Linearizability for every single message in the village, so everyone sees one global order.", correct: false, feedback: "It works, but it's more than needed and slower." },
        { text: "Sort all messages by wall-clock time.", correct: false, feedback: "Skewed clocks can still reverse them." },
      ],
    },
  },
  {
    id: "9.4", chapter: 9, title: "Lamport clocks & total order broadcast", needs: ["9.3"],
    card: {
      body: [
        "A Lamport timestamp is a pair (counter, node ID). Each node increments its counter on every event, and when it sees a message with a bigger counter, it jumps its own counter up to it. The result is a total order consistent with causality.",
        "But a Lamport timestamp only tells you the order after the fact. To enforce 'username claimed once', a node must know now that no one else has a lower timestamp for it.",
        "Total order broadcast solves that: every node delivers the same messages, reliably, in the same order. It's equivalent to consensus, and it's the backbone of database replication and of linearizable storage.",
      ],
      anchor: "Lamport orders the past; total order broadcast agrees on the future.",
      terms: ["Lamport timestamp", "total order broadcast", "logical clock"],
    },
    recall: {
      q: "A Lamport timestamp consists of:",
      options: ["A counter and a node ID", "The wall-clock time in milliseconds", "A random number per event", "A version number per key"],
      answer: 0,
      why: "Node ID breaks ties between equal counters.",
    },
    quiz: [
      {
        q: "When a node receives a message with a higher counter, it:",
        options: ["Raises its own counter to that value", "Ignores it and keeps its own counter", "Resets its own counter back to zero", "Asks the sender to slow down its counter"],
        answer: 0,
        why: "That's how causality flows into the order.",
      },
      {
        q: "Why aren't Lamport timestamps enough for uniqueness constraints?",
        options: ["You only know the order after collecting all operations", "They wrap around after a few thousand operations", "They depend on wall clocks that drift over time", "Two different nodes can produce the same timestamp"],
        answer: 0,
        why: "You can't decide now if someone else might have a lower timestamp.",
      },
      {
        q: "Total order broadcast guarantees:",
        options: ["All nodes deliver the same messages in the same order", "Messages arrive within a fixed, known delay", "No message is ever sent more than once", "Only the leader receives each message"],
        answer: 0,
        why: "It's equivalent to consensus.",
      },
    ],
    scenario: {
      title: "The Royal Decrees", npc: "Royal Scribe", scene: "castle",
      story: "Decrees are copied to five castles, but each castle applies them in a different order, so the laws disagree.",
      ask: "What do the castles need?",
      choices: [
        { text: "Total order broadcast: every castle applies the same decrees in the same order.", correct: true, feedback: "That's how replicas stay identical." },
        { text: "Apply decrees in the order each courier arrives.", correct: false, feedback: "That's the current mess." },
        { text: "Let each castle apply the decrees it agrees with, in the order its own council prefers.", correct: false, feedback: "Five kingdoms, not one." },
      ],
    },
  },
  {
    id: "9.5", chapter: 9, title: "Two-phase commit", needs: ["9.4"],
    card: {
      body: [
        "Atomic commit across several nodes means every node commits, or every node aborts. Two-phase commit (2PC) does this with a coordinator.",
        "Phase 1, prepare: the coordinator asks each participant 'can you commit?'. A participant that says yes promises it will commit if told to, even after a crash. Phase 2, commit: if every participant said yes, the coordinator records the decision in its log and tells everyone to commit; otherwise it tells everyone to abort.",
        "The weakness: if the coordinator crashes after participants voted yes, they're 'in doubt'. They must hold their locks and wait for the coordinator to come back. 2PC is a blocking protocol.",
      ],
      anchor: "Everyone votes yes, then the coordinator decides; if it dies, everyone waits.",
      terms: ["two-phase commit", "coordinator", "prepare", "in doubt"],
    },
    recall: {
      q: "In 2PC, a participant that votes yes in the prepare phase:",
      options: ["Promises it will commit if told to, even after a crash", "Commits its part immediately, then tells the coordinator", "Can still abort later on its own if it changes its mind", "Takes over as coordinator if the coordinator is slow"],
      answer: 0,
      why: "The vote is a binding promise.",
    },
    quiz: [
      {
        q: "If any participant votes no, the coordinator:",
        options: ["Tells everyone to abort", "Commits on the participants that voted yes", "Asks the participant that voted no to vote again", "Waits for the no to time out and then commits"],
        answer: 0,
        why: "Atomicity: all or nothing.",
      },
      {
        q: "Why is 2PC called blocking?",
        options: ["In-doubt participants must wait for the coordinator to recover", "Every participant locks the network while the vote is running", "The coordinator can only handle one transaction at a time", "It only runs on a single thread on each participant"],
        answer: 0,
        why: "They can't decide alone without risking inconsistency.",
      },
      {
        q: "The commit point in 2PC is when:",
        options: ["The coordinator writes its decision to its log", "The first participant finishes committing", "The client sends the commit request", "All participants release their locks"],
        answer: 0,
        why: "After that the decision is irrevocable.",
      },
    ],
    scenario: {
      title: "The Missing Herald", npc: "Council Clerk", scene: "castle",
      story: "Three guilds voted yes to a joint purchase. Then the herald who collects the votes disappeared. The guilds have frozen their treasuries for a day, waiting.",
      ask: "What's going on?",
      choices: [
        { text: "That's 2PC blocking: in-doubt participants wait for the coordinator. Make the coordinator's role fault-tolerant.", correct: true, feedback: "Consensus-based coordinators avoid the single point of failure." },
        { text: "Each guild should guess the outcome and commit or abort on its own.", correct: false, feedback: "If the herald had decided abort, the guilds would disagree." },
        { text: "Vote again with a new herald.", correct: false, feedback: "The old herald may already have recorded a decision." },
      ],
    },
  },
  {
    id: "9.6", chapter: 9, title: "Fault-tolerant consensus", needs: ["9.2", "9.5"],
    card: {
      body: [
        "Consensus means getting several nodes to agree on a value, such as who the leader is. Good algorithms (Paxos, Raft, Zab) keep working as long as a majority of nodes are up, and guarantee that everyone decides the same value.",
        "They work in epochs (Raft calls them terms): each election produces a new, higher epoch number, and a leader's decisions only count if a majority of nodes confirm that no higher epoch exists. That majority vote prevents split brain.",
        "Most apps don't implement consensus themselves. They use a coordination service like ZooKeeper or etcd for leader election, locks with fencing tokens, membership and configuration.",
      ],
      anchor: "A majority agrees, in numbered epochs; borrow it from ZooKeeper.",
      terms: ["consensus", "Raft", "epoch / term", "ZooKeeper"],
    },
    recall: {
      q: "Raft or Paxos keep working as long as:",
      options: ["A majority of nodes are up", "Every node is up", "At least one node is up", "The leader never crashes"],
      answer: 0,
      why: "Majorities always overlap, so decisions are consistent.",
    },
    quiz: [
      {
        q: "What prevents two leaders from both making decisions?",
        options: ["Decisions need a majority vote in the current epoch", "Clocks are synchronized so only one leader can act", "The leader runs on the most powerful machine", "Nodes wait a random time before acting"],
        answer: 0,
        why: "An old leader can't get a majority once a higher epoch exists.",
      },
      {
        q: "Most applications get consensus by:",
        options: ["Using a service like ZooKeeper or etcd", "Writing their own version of Paxos", "Ordering events by wall-clock time", "Making sure no node ever fails"],
        answer: 0,
        why: "Consensus is notoriously hard to implement correctly.",
      },
      {
        q: "With 5 nodes, how many can fail while consensus continues?",
        options: ["2", "1", "3", "4"],
        answer: 0,
        why: "3 of 5 is still a majority.",
      },
    ],
    scenario: {
      title: "The Council of Five", npc: "Chancellor", scene: "castle",
      story: "Our five castles must choose one king at a time, even if two castles are cut off by storms.",
      ask: "How should they decide?",
      choices: [
        { text: "Use a consensus protocol: a king needs votes from at least three castles, in a numbered reign.", correct: true, feedback: "A majority of five tolerates two failures." },
        { text: "The first castle to declare a king wins.", correct: false, feedback: "Two castles could declare at once: split brain." },
        { text: "Require all five castles to agree on every king, so nobody can ever disagree about who rules.", correct: false, feedback: "Then one storm stops the kingdom." },
      ],
    },
  },
];
