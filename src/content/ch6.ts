import type { Block } from "./types.js";

// Options are written with the correct answer first; the server shuffles them.
export const CH6: Block[] = [
  {
    id: "6.1", chapter: 6, title: "Why partition", needs: [],
    card: {
      body: [
        "When data or query load outgrows one machine, you split the dataset into partitions (also called shards). Each record belongs to exactly one partition, and each partition is like a small database of its own.",
        "The goal is scalability: spread data and queries evenly over many nodes, so ten nodes can handle roughly ten times the load. If the split is uneven, some partitions get more than their share. That's called skew, and an overloaded partition is a hot spot.",
        "Partitioning is usually combined with replication: each partition has copies on several nodes, so a node may be the leader for some partitions and a follower for others.",
      ],
      anchor: "Split to scale; skew is the enemy.",
      terms: ["partition / shard", "skew", "hot spot"],
    },
    recall: {
      q: "What is a hot spot?",
      options: ["A partition getting far more load than the others", "A node that has just restarted after a crash", "A replica that's fully up to date", "A partition that holds no data yet"],
      answer: 0,
      why: "Uneven load concentrates on one partition, so adding nodes no longer helps.",
    },
    quiz: [
      {
        q: "The main reason to partition data is:",
        options: ["Scalability: spread data and load over many machines", "Making every query faster on a single machine", "Avoiding the cost of replication entirely", "Enforcing one schema across all the tables"],
        answer: 0,
        why: "Partitioning lets the dataset and the query load exceed one machine.",
      },
      {
        q: "How do partitioning and replication usually relate?",
        options: ["Each partition is replicated on several nodes", "You have to choose either partitioning or replication, not both", "Replication makes partitioning unnecessary", "Only the followers are ever partitioned"],
        answer: 0,
        why: "The two are independent and commonly combined.",
      },
      {
        q: "If partitions are skewed, adding more nodes:",
        options: ["Helps much less, because the hot partition stays overloaded", "Fixes the skew, because data is reshuffled automatically", "Makes every query slower, because there are more hops", "Removes the hot spot once the new nodes take writes"],
        answer: 0,
        why: "The load sits on one partition; new nodes don't take any of it.",
      },
    ],
    scenario: {
      title: "The Overflowing Archive", npc: "Royal Archivist", scene: "library",
      story: "Our scroll index no longer fits in one tower, and the queue of readers grows every day.",
      ask: "What do you propose?",
      choices: [
        { text: "Split the index across several towers, each owning a share of the scrolls, and copy each share for safety.", correct: true, feedback: "Partitioning plus replication: scale and durability together." },
        { text: "Build one taller tower.", correct: false, feedback: "Scaling up has a ceiling, and it's still a single point of failure." },
        { text: "Put a complete copy of every scroll in every tower, so readers can go to any of them and never queue.", correct: false, feedback: "That's replication. It helps reads but doesn't shrink the dataset per tower." },
      ],
    },
  },
  {
    id: "6.2", chapter: 6, title: "Partitioning by key range", needs: ["6.1"],
    card: {
      body: [
        "One way to partition is to give each partition a continuous range of keys, like the volumes of an encyclopedia: A–Ca, Cb–Do, and so on. The boundaries adapt to the data so that each range holds a similar amount.",
        "Within each partition, keys are kept sorted. That makes range scans efficient: 'all readings from March' touches only a few partitions.",
        "The danger is hot spots. If the key is a timestamp, all of today's writes land in the same partition while the others sit idle. A common fix is to prefix the key with something else, such as the sensor name, at the cost of range queries needing one query per prefix.",
      ],
      anchor: "Ranges keep order but invite hot spots.",
      terms: ["key-range partitioning", "range scan", "boundaries"],
    },
    recall: {
      q: "What is the main advantage of key-range partitioning?",
      options: ["Efficient range scans over sorted keys", "Perfectly even load across all partitions", "No need to ever rebalance partitions", "Fewer replicas needed for each partition"],
      answer: 0,
      why: "Neighbouring keys live together, so a range touches few partitions.",
    },
    quiz: [
      {
        q: "Keys are timestamps and partitioned by range. What happens?",
        options: ["Today's writes all hit one partition", "Writes spread evenly over every partition", "Range queries over time become impossible", "Older partitions are deleted automatically"],
        answer: 0,
        why: "New timestamps are always in the latest range.",
      },
      {
        q: "How can you avoid that timestamp hot spot?",
        options: ["Prefix the key, e.g. with the sensor name", "Add more replicas of the busiest partition", "Store the keys unsorted within each partition", "Partition by the size of each record instead"],
        answer: 0,
        why: "Writes from different sensors spread across ranges.",
      },
      {
        q: "Range boundaries are best chosen:",
        options: ["To fit how the data is actually distributed", "Evenly across the alphabet, so each partition gets the same letters", "At random, so nobody can predict them", "Once, at setup, and then never changed"],
        answer: 0,
        why: "Data is rarely uniform; boundaries follow it.",
      },
    ],
    scenario: {
      title: "The Midnight Rush", npc: "Market Clerk", scene: "market",
      story: "Sales are keyed by time and split by range. Every evening one shelf of the ledger is on fire while the rest gather dust.",
      ask: "What's the fix?",
      choices: [
        { text: "Prefix each key with the stall name so writes spread across ranges.", correct: true, feedback: "Spreads the load. Range scans per stall still work." },
        { text: "Hire a faster clerk for the busy shelf and move him to whichever shelf is hot each evening.", correct: false, feedback: "Tomorrow the hot shelf is a different one, and he's still alone." },
        { text: "Stop sorting the ledger.", correct: false, feedback: "You'd lose range scans and keep the hot spot." },
      ],
    },
  },
  {
    id: "6.3", chapter: 6, title: "Partitioning by hash", needs: ["6.1"],
    card: {
      body: [
        "To avoid skew, many stores pass each key through a hash function and give each partition a range of hashes. A good hash spreads similar keys randomly, so load is even.",
        "The price: adjacent keys are now scattered, so efficient range queries over the key are lost.",
        "A compromise is a compound key: hash the first part to choose the partition and keep the rest sorted inside it. For example, (user_id, timestamp) puts all of one user's posts in one partition, sorted by time.",
      ],
      anchor: "Hashing spreads load but scatters order.",
      terms: ["hash partitioning", "compound key", "range of hashes"],
    },
    recall: {
      q: "What do you give up with hash partitioning?",
      options: ["Efficient range queries over the key", "An even spread of load", "The ability to replicate partitions", "Durability of writes"],
      answer: 0,
      why: "Neighbouring keys end up in different partitions.",
    },
    quiz: [
      {
        q: "Why is the hash function chosen with care?",
        options: ["It must spread keys evenly and be the same on every node", "It must encrypt the keys so other nodes can't read them", "It must keep similar keys next to each other for scans", "It decides which replica becomes leader for each key"],
        answer: 0,
        why: "Some language hash functions differ between processes, which would break routing.",
      },
      {
        q: "With a compound key (user_id, timestamp), what is efficient?",
        options: ["One user's posts in a time range", "All posts in a time range, across every user", "All users listed alphabetically by name", "Nothing; compound keys disable range scans"],
        answer: 0,
        why: "The user's posts share a partition and are sorted by time.",
      },
      {
        q: "Can hashing remove every hot spot?",
        options: ["No: one extremely popular key still lands on one partition", "Yes: hashing spreads every workload perfectly evenly", "Only if you add more replicas for each partition", "Only when keys are strings rather than numbers"],
        answer: 0,
        why: "A celebrity's key hashes to one place; apps may split it with a random suffix.",
      },
    ],
    scenario: {
      title: "The Famous Bard", npc: "Guildmaster", scene: "guild",
      story: "Keys are hashed, yet whenever the famous bard posts, one partition melts under the replies.",
      ask: "What can we do?",
      choices: [
        { text: "Split that one hot key with a small random suffix, and read all the pieces when needed.", correct: true, feedback: "Spreads writes for the hot key, at the cost of extra reads." },
        { text: "Switch to a better hash function so the bard's key spreads out across all the partitions.", correct: false, feedback: "Any hash sends the same key to the same place." },
        { text: "Ban the bard.", correct: false, feedback: "The guild would riot." },
      ],
    },
  },
  {
    id: "6.4", chapter: 6, title: "Secondary indexes", needs: ["6.2", "6.3"],
    card: {
      body: [
        "Partitioning by primary key is simple, but secondary indexes ('all red cars') don't follow the primary key. There are two approaches.",
        "Local (document-partitioned) index: each partition indexes only its own records. Writes stay on one partition, but a query must ask every partition and combine the answers (scatter/gather), which suffers from tail latency.",
        "Global (term-partitioned) index: the index itself is partitioned by the indexed value, so 'colour:red' lives on one partition. Reads are efficient, but one write may touch several index partitions, so global indexes are often updated asynchronously.",
      ],
      anchor: "Local index: cheap writes, scattered reads. Global: the opposite.",
      terms: ["local index", "global index", "scatter/gather"],
    },
    recall: {
      q: "A query on a local secondary index must:",
      options: ["Ask every partition and combine results", "Ask exactly one partition", "Go through the leader only", "Rebuild the index first"],
      answer: 0,
      why: "Each partition only knows its own records.",
    },
    quiz: [
      {
        q: "Why are global indexes often updated asynchronously?",
        options: ["One write can affect index partitions on other nodes", "Global indexes are kept only in memory, so writes to disk come later", "Reads would otherwise become slower", "Hash partitioning requires it"],
        answer: 0,
        why: "A synchronous update would need a distributed transaction.",
      },
      {
        q: "Scatter/gather queries are vulnerable to:",
        options: ["Tail latency: the slowest partition decides", "Hot spots, because every write goes to the index leader", "Lost updates between partitions", "Schema changes on every partition"],
        answer: 0,
        why: "You wait for every partition, so one slow one delays all.",
      },
      {
        q: "A global index for 'colour' is partitioned by:",
        options: ["The colour value (the term)", "The car's primary key", "The time the car was added", "A random number"],
        answer: 0,
        why: "That's why it's called term-partitioned.",
      },
    ],
    scenario: {
      title: "The Red Carriages", npc: "Royal Stablemaster", scene: "castle",
      story: "Carriages are partitioned by ID. Finding every red carriage means asking all 40 stables, and the slowest stable makes everyone wait.",
      ask: "Searches by colour are frequent. What do you suggest?",
      choices: [
        { text: "Build a global index partitioned by colour, updated asynchronously.", correct: true, feedback: "Fast reads for frequent queries, accepting a slightly stale index." },
        { text: "Keep asking all 40 stables, but give every stable a faster messenger.", correct: false, feedback: "Scatter/gather still waits for the slowest stable." },
        { text: "Repartition all the carriages by colour instead of by their ID.", correct: false, feedback: "Then lookups by ID become scatter/gather instead." },
      ],
    },
  },
  {
    id: "6.5", chapter: 6, title: "Rebalancing & routing", needs: ["6.3"],
    card: {
      body: [
        "Over time nodes are added or fail, so partitions must move: rebalancing. Don't assign keys with hash mod N: when N changes, almost every key moves.",
        "Better: create many more partitions than nodes (say 1,000 for 10 nodes) and move whole partitions when nodes join. Or split and merge partitions dynamically as they grow and shrink. Automatic rebalancing is convenient, but a human in the loop avoids cascades during an overload.",
        "Clients must find the right node: ask any node and let it forward, use a routing tier, or let clients know the map. A coordination service like ZooKeeper often tracks which partition lives where.",
      ],
      anchor: "Move whole partitions, never mod N.",
      terms: ["rebalancing", "fixed partitions", "routing tier", "ZooKeeper"],
    },
    recall: {
      q: "Why is hash mod N a bad way to assign partitions?",
      options: ["Changing N moves almost every key", "It's slow to compute for every key", "It can't handle keys that are strings", "It needs a leader to do the maths"],
      answer: 0,
      why: "A small change in the cluster size reshuffles everything.",
    },
    quiz: [
      {
        q: "With many fixed partitions per node, adding a node means:",
        options: ["It steals a few whole partitions from others", "Every key in the cluster is hashed again", "The whole cluster restarts to rebalance", "Every partition splits in two"],
        answer: 0,
        why: "Only partition-to-node assignments change.",
      },
      {
        q: "A coordination service like ZooKeeper is often used to:",
        options: ["Track which partition lives on which node", "Store a full copy of the data for every partition", "Hash keys before they're written", "Compress partitions that aren't used"],
        answer: 0,
        why: "Routing needs an authoritative map of assignments.",
      },
      {
        q: "Why keep a human in the loop for rebalancing?",
        options: ["Automatic moves during an overload can cause cascading failures", "Computers can't safely copy large amounts of data between nodes", "Regulations require a person to approve every data movement", "Moving partitions by hand makes reads faster afterwards"],
        answer: 0,
        why: "A slow node may look dead and trigger costly moves at the worst time.",
      },
    ],
    scenario: {
      title: "The Eleventh Tower", npc: "Master Builder", scene: "castle",
      story: "We have 10 towers and assign scrolls with id mod 10. When we add an 11th tower, nearly every scroll must move.",
      ask: "How should it work instead?",
      choices: [
        { text: "Create 1,000 partitions up front and hand a few whole ones to the new tower.", correct: true, feedback: "Only the reassigned partitions move." },
        { text: "Never add towers.", correct: false, feedback: "The kingdom keeps growing." },
        { text: "Switch to id mod 11 and move all the scrolls to their new towers overnight while the archive is closed.", correct: false, feedback: "That's the same problem, scheduled." },
      ],
    },
  },
];
