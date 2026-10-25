import type { Block } from "./types.js";

// Options are written with the correct answer first; the server shuffles them.
export const CH8: Block[] = [
  {
    id: "8.1", chapter: 8, title: "Partial failures & networks", needs: [],
    card: {
      body: [
        "On one computer, things usually either work or crash. In a distributed system, some parts fail while others keep working: partial failure. It's also nondeterministic, so the same operation can succeed one time and fail the next.",
        "Most datacenter networks are asynchronous: a message can be lost, delayed, or delivered while the reply is lost. When you send a request and hear nothing, you can't tell which happened, or whether the remote node is down or just slow.",
        "The usual tool is a timeout, which tells you that something is wrong, but never exactly what.",
      ],
      anchor: "Silence tells you nothing; you only know you didn't hear back.",
      terms: ["partial failure", "asynchronous network", "timeout"],
    },
    recall: {
      q: "You sent a request and got no reply. What do you know?",
      options: ["Only that you didn't get a reply in time", "That the remote node has crashed", "That the request was lost on the way", "That the request was processed"],
      answer: 0,
      why: "The request, the processing or the reply could each be the problem.",
    },
    quiz: [
      {
        q: "Partial failure means:",
        options: ["Some components fail while others keep working", "The whole system crashes at the same moment", "A disk is half full and starts slowing down", "A transaction commits on some rows but not others"],
        answer: 0,
        why: "This is what makes distributed systems hard.",
      },
      {
        q: "Why can't you detect a network fault perfectly?",
        options: ["A lost message and a slow node look the same", "TCP hides every error from the application, including lost packets", "Networks almost never lose messages", "Packets are encrypted so errors are hidden"],
        answer: 0,
        why: "Both just look like silence.",
      },
      {
        q: "Which is NOT a possible reason for no reply?",
        options: ["The reply was guaranteed delivered", "The request was lost in the network", "The remote node paused for a while", "The reply was lost on the way back"],
        answer: 0,
        why: "Nothing is guaranteed in an asynchronous network.",
      },
    ],
    scenario: {
      title: "The Silent Courier", npc: "Postmaster", scene: "harbor",
      story: "We sent a courier to the northern fort asking for grain. No answer for two days.",
      ask: "What can we conclude?",
      choices: [
        { text: "Nothing certain: the courier, the fort or the reply could be the problem. Decide based on a timeout.", correct: true, feedback: "Silence is ambiguous; plan for it." },
        { text: "The fort has fallen.", correct: false, feedback: "Maybe it's just a slow reply." },
        { text: "The grain is definitely on its way, and the fort was simply too busy to write back to us.", correct: false, feedback: "Or the request was never received." },
      ],
    },
  },
  {
    id: "8.2", chapter: 8, title: "Timeouts & unbounded delays", needs: ["8.1"],
    card: {
      body: [
        "How long should a timeout be? Too short and you declare healthy-but-slow nodes dead, which moves their load elsewhere and can cause cascading failures. Too long and users wait while a node really is dead.",
        "Network delays are unbounded because of queueing: in switches, in the receiving machine's network stack, in the virtual machine scheduler, and in TCP's own retransmissions and flow control. When the network is busy, delays shoot up.",
        "There's no correct fixed value. Measure round-trip times and adjust timeouts to the observed distribution; some systems use adaptive failure detectors such as the Phi accrual detector.",
      ],
      anchor: "Delays queue up; pick timeouts from measurements.",
      terms: ["queueing delay", "unbounded delay", "adaptive timeout"],
    },
    recall: {
      q: "What's the danger of a timeout that's too short?",
      options: ["Declaring slow-but-alive nodes dead, causing cascades", "Users waiting a long time when a node really is dead", "Losing data that was written to disk just before", "Deadlocks between transactions on different nodes"],
      answer: 0,
      why: "Load moves onto other nodes, which then slow down too.",
    },
    quiz: [
      {
        q: "Most network delay variability comes from:",
        options: ["Queueing", "The speed of light", "Encryption overhead", "Disk seeks"],
        answer: 0,
        why: "Packets wait in queues at switches and hosts.",
      },
      {
        q: "A sensible way to choose timeouts is to:",
        options: ["Measure response times and adapt", "Always use exactly one second", "Never time out; wait forever", "Use the median response time"],
        answer: 0,
        why: "Networks differ; base it on what you observe.",
      },
      {
        q: "Datacenter networks are mostly:",
        options: ["Packet-switched with unbounded delays", "Circuit-switched, with a fixed delay for every message", "Synchronous, with bounded delays", "Free of delay inside a building"],
        answer: 0,
        why: "They're optimised for bursty traffic, not guaranteed latency.",
      },
    ],
    scenario: {
      title: "The Impatient Watch", npc: "Captain of the Guard", scene: "castle",
      story: "We declare a gate dead if it doesn't answer within 50ms. During market day, half the gates are 'dead' and their duties pile onto the rest, which then die too.",
      ask: "What's wrong?",
      choices: [
        { text: "The timeout is far too short for busy days. Base it on measured response times.", correct: true, feedback: "Avoids false alarms and cascading failures." },
        { text: "Shorten the timeout to 1ms so dead gates are detected even faster on market day.", correct: false, feedback: "Even more false alarms." },
        { text: "Remove timeouts entirely.", correct: false, feedback: "Then a dead gate is never noticed." },
      ],
    },
  },
  {
    id: "8.3", chapter: 8, title: "Unreliable clocks", needs: ["8.1"],
    card: {
      body: [
        "Machines have two kinds of clocks. Time-of-day clocks give wall-clock time and are synced with NTP, so they can jump backwards or forwards. Monotonic clocks only move forward and are right for measuring elapsed time, but their value means nothing across machines.",
        "Quartz clocks drift, NTP sync is only as good as network delays, and clocks can be off by much more than you'd guess. Ordering events across nodes by timestamp is risky: with last-write-wins, a node with a fast clock can silently overwrite newer data.",
        "A clock reading is really a range with a confidence interval. Google's Spanner uses that idea, waiting out the uncertainty before committing.",
      ],
      anchor: "Monotonic for durations; never trust wall clocks for order.",
      terms: ["time-of-day clock", "monotonic clock", "clock drift", "NTP"],
    },
    recall: {
      q: "To measure how long a request took, use:",
      options: ["A monotonic clock", "The time-of-day clock", "An NTP query", "A Lamport timestamp"],
      answer: 0,
      why: "It never jumps backwards when the wall clock is corrected.",
    },
    quiz: [
      {
        q: "Why is last-write-wins by timestamp dangerous?",
        options: ["A node with a fast clock can overwrite newer writes", "Timestamps take up too much space in each record", "It only works when there's a single leader", "Comparing timestamps is too slow at high load"],
        answer: 0,
        why: "Clock skew silently drops data.",
      },
      {
        q: "A time-of-day clock can:",
        options: ["Jump backwards after an NTP correction", "Never change once the machine has booted", "Only ever move forward, never back", "Be compared exactly across machines"],
        answer: 0,
        why: "Synchronization can reset it.",
      },
      {
        q: "Spanner's approach to clock uncertainty is to:",
        options: ["Wait out the confidence interval before committing", "Use one global atomic clock that every machine reads over the network", "Ignore clock uncertainty because it's tiny", "Turn off NTP so clocks never jump"],
        answer: 0,
        why: "Non-overlapping intervals give a safe order.",
      },
    ],
    scenario: {
      title: "The Fast Sundial", npc: "Royal Clockmaker", scene: "castle",
      story: "Two towers record edits with their local time and keep the latest. One tower's clock runs 3 seconds fast, and the other tower's newer edits keep vanishing.",
      ask: "What's happening?",
      choices: [
        { text: "Last-write-wins with skewed clocks drops newer data. Order by something else, like version vectors or a leader.", correct: true, feedback: "Wall clocks can't order events safely across machines." },
        { text: "The slow tower is lazy.", correct: false, feedback: "It's the clocks, not the tower." },
        { text: "Sync both clocks once a year at the spring festival, and keep last-write-wins as it is.", correct: false, feedback: "Drift and skew come back within hours." },
      ],
    },
  },
  {
    id: "8.4", chapter: 8, title: "Process pauses", needs: ["8.3"],
    card: {
      body: [
        "A running thread can be paused at any moment for a surprisingly long time: a stop-the-world garbage collection, a virtual machine being suspended and migrated, a laptop lid closed, heavy swapping to disk, or a SIGSTOP.",
        "The paused node doesn't notice. From its point of view no time passed, while the rest of the cluster may have declared it dead and moved on.",
        "Classic bug: a leader checks its lease ('I'm leader for 10 more seconds'), gets paused for 15 seconds, then wakes and processes a request as if it were still leader, while another node has already taken over.",
      ],
      anchor: "A node can sleep mid-sentence and wake up thinking nothing happened.",
      terms: ["GC pause", "lease", "stop-the-world"],
    },
    recall: {
      q: "During a long process pause, the paused node:",
      options: ["Doesn't notice that time passed", "Warns the other nodes first", "Gives up all its leases", "Speeds up its clock to catch up"],
      answer: 0,
      why: "It simply resumes as if nothing happened.",
    },
    quiz: [
      {
        q: "Which can cause a multi-second pause?",
        options: ["A stop-the-world garbage collection", "Adding two small integers", "Reading a constant from memory", "A hit in the CPU cache"],
        answer: 0,
        why: "Other causes: VM suspension, swapping, SIGSTOP.",
      },
      {
        q: "Why is checking a lease and then acting risky?",
        options: ["A pause between the check and the action can outlast the lease", "Leases never expire once they've been granted to a node", "Checking a lease takes longer than the action itself", "Leases are stored in a database that may be down"],
        answer: 0,
        why: "By the time you act, someone else may be leader.",
      },
      {
        q: "From the cluster's view, a long-paused node looks:",
        options: ["Dead", "Faster", "Healthy", "Like the leader"],
        answer: 0,
        why: "It stops responding, so it gets declared dead.",
      },
    ],
    scenario: {
      title: "The Sleeping Steward", npc: "Royal Steward", scene: "castle",
      story: "Our steward holds the treasury key for 10 minutes at a time. Today he dozed off for 15 minutes, woke up, and paid a bill, even though a new steward had taken the key meanwhile.",
      ask: "What's the lesson?",
      choices: [
        { text: "A paused node can act on an expired lease. The treasury itself must reject stale stewards.", correct: true, feedback: "Which leads to fencing tokens, next." },
        { text: "Hire stewards who never sleep, and keep the ten-minute key.", correct: false, feedback: "Every process can pause." },
        { text: "Give leases of one second.", correct: false, feedback: "A pause can still outlast any lease." },
      ],
    },
  },
  {
    id: "8.5", chapter: 8, title: "Quorums, fencing & Byzantine faults", needs: ["8.2", "8.4"],
    card: {
      body: [
        "A node can't trust its own judgement about its situation. Instead, decisions like 'that node is dead' or 'I am the leader' are made by a quorum: a majority vote of nodes.",
        "Fencing tokens protect resources from zombie leaders. Every time a lease is granted, the lock service hands out an increasing number. The storage accepts a write only if its token is higher than any it has already seen, so a paused old leader with token 33 is rejected after token 34 has written.",
        "All of this assumes nodes are honest but unreliable. Byzantine faults, where nodes lie or are malicious, need much heavier algorithms, used mainly in aerospace and blockchains, not in a typical datacenter.",
      ],
      anchor: "Majorities decide; tokens fence out zombies.",
      terms: ["quorum", "fencing token", "Byzantine fault"],
    },
    recall: {
      q: "A fencing token works because:",
      options: ["Storage rejects writes with a lower token than one already seen", "The token encrypts the data so only the leader can write it", "Tokens never expire, so the leader can always prove itself", "The client keeps the token and checks it before every write"],
      answer: 0,
      why: "A stale leader's old token is refused.",
    },
    quiz: [
      {
        q: "Who decides whether a node is dead?",
        options: ["A quorum of nodes", "The node itself", "The client", "The fastest node"],
        answer: 0,
        why: "No single node is trusted to judge alone.",
      },
      {
        q: "Byzantine fault tolerance is needed when nodes may:",
        options: ["Lie or act maliciously", "Crash without warning", "Respond very slowly", "Lose network packets"],
        answer: 0,
        why: "Ordinary datacenter systems assume nodes are honest.",
      },
      {
        q: "Old leader has token 33; new leader wrote with 34. Old leader wakes and writes with 33. The storage:",
        options: ["Rejects it", "Accepts it", "Merges both writes", "Crashes"],
        answer: 0,
        why: "33 is lower than the 34 it has already seen.",
      },
    ],
    scenario: {
      title: "Two Keys, One Vault", npc: "Treasury Guard", scene: "castle",
      story: "The sleeping steward is back and trying to pay another bill with his old key.",
      ask: "How should the vault defend itself?",
      choices: [
        { text: "Number every key issued; the vault refuses any key lower than the highest it has seen.", correct: true, feedback: "A fencing token." },
        { text: "Trust whoever reaches the vault first with a key.", correct: false, feedback: "The sleeper might arrive first." },
        { text: "Ask the steward whether he's still in charge before he opens the vault, and trust his answer.", correct: false, feedback: "He believes he is." },
      ],
    },
  },
];
