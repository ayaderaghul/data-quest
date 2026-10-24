// New-moon fairy puzzles: put the steps in the right order.
// Steps are written in the correct order; the server shuffles them.
export interface FairyPuzzle {
  id: string;
  chapter: number;
  title: string;
  prompt: string;
  steps: string[];
  proverb: { text: string; lang: "it" | "en"; meaning: string; why: string };
}

export const FAIRY_PUZZLES: FairyPuzzle[] = [
  {
    id: "rollout", chapter: 1, title: "The Careful Rollout",
    prompt: "A new gate config must reach all 12 servers. Put the steps of a safe rollout in order.",
    steps: [
      "Try the change in a sandbox",
      "Roll it out to a few servers",
      "Watch the monitoring for errors",
      "Roll out everywhere, or roll back",
    ],
    proverb: {
      text: "Chi va piano va sano e va lontano.", lang: "it",
      meaning: "Whoever goes slowly goes safely and goes far.",
      why: "Gradual rollouts turn a human mistake into a small fault instead of a castle-wide failure.",
    },
  },
  {
    id: "upgrade", chapter: 4, title: "The Rolling Upgrade",
    prompt: "You're changing a record format while servers upgrade one by one. Order the steps so nothing breaks.",
    steps: [
      "Ship code that can read both the old and new format",
      "Roll that code out node by node",
      "Once every node has it, start writing the new format",
      "Later, drop support for the old format",
    ],
    proverb: {
      text: "Prevenire è meglio che curare.", lang: "it",
      meaning: "Preventing is better than curing.",
      why: "Making readers tolerant before writers change is cheaper than repairing broken data afterwards.",
    },
  },
  {
    id: "retry", chapter: 4, title: "The Safe Retry",
    prompt: "An order request times out and the app retries. Order the steps that keep the baker from getting two orders.",
    steps: [
      "Client sends the order with a unique ID",
      "The request times out",
      "Client retries with the same ID",
      "Server sees the ID and ignores the duplicate",
    ],
    proverb: {
      text: "Fidarsi è bene, non fidarsi è meglio.", lang: "it",
      meaning: "Trusting is good; not trusting is better.",
      why: "Never trust the network to deliver exactly once. Make repeats harmless instead.",
    },
  },
  {
    id: "lsm", chapter: 3, title: "The Path of a Write",
    prompt: "Follow one write through an LSM-tree, from arrival to its final home.",
    steps: [
      "Append the write to the log on disk",
      "Insert it into the in-memory memtable",
      "Flush the full memtable as a sorted SSTable",
      "Merge old segments during compaction",
    ],
    proverb: {
      text: "Little strokes fell great oaks.", lang: "en",
      meaning: "Many small actions add up to a big result.",
      why: "Small sequential writes and steady background merges handle enormous write loads.",
    },
  },
  {
    id: "btree", chapter: 3, title: "The Descent",
    prompt: "Find one key in a B-tree. Order the steps of the lookup.",
    steps: [
      "Start at the root page",
      "Follow the pointer for the range that contains the key",
      "Repeat at each level of the tree",
      "Read the value from the leaf page",
    ],
    proverb: {
      text: "Tutte le strade portano a Roma.", lang: "it",
      meaning: "All roads lead to Rome.",
      why: "However big the tree, every lookup walks the same few levels down to one leaf.",
    },
  },
  {
    id: "follower", chapter: 5, title: "The New Follower",
    prompt: "A new follower joins the castle. Order the steps to bring it up to date without stopping writes.",
    steps: [
      "Take a consistent snapshot of the leader",
      "Copy the snapshot to the new follower",
      "Request every change after the snapshot's log position",
      "Keep streaming new changes from the leader",
    ],
    proverb: {
      text: "Roma non fu fatta in un giorno.", lang: "it",
      meaning: "Rome wasn't built in a day.",
      why: "A new replica catches up in stages: the bulk first, then the changes since.",
    },
  },
  {
    id: "failover", chapter: 5, title: "The King Is Dead",
    prompt: "The leader has crashed. Order the steps of a clean failover.",
    steps: [
      "Detect the failure with a timeout",
      "Choose the most up-to-date follower as the new leader",
      "Send all writes to the new leader",
      "Fence the old leader if it comes back",
    ],
    proverb: {
      text: "Morto un papa, se ne fa un altro.", lang: "it",
      meaning: "When one pope dies, another is made.",
      why: "No single node is irreplaceable. Failover promotes a successor, and the system carries on.",
    },
  },
  {
    id: "quorum", chapter: 5, title: "The Council Reads",
    prompt: "A leaderless read with n=3, r=2. Order the steps.",
    steps: [
      "Send the read to two replicas",
      "Collect their values with version numbers",
      "Return the newest value",
      "Write it back to any stale replica",
    ],
    proverb: {
      text: "L'unione fa la forza.", lang: "it",
      meaning: "Unity makes strength.",
      why: "No single replica is trusted alone. Overlapping quorums together find the latest value.",
    },
  },
];
