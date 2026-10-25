import type { Block } from "./types.js";

export const CH1: Block[] = [
  {
    id: "1.1", chapter: 1, title: "Faults & failures", needs: [],
    card: {
      body: [
        "A fault is one component going wrong: a disk dies, a bug fires, an operator types the wrong command. A failure is when the system as a whole stops serving users. A reliable system is fault-tolerant: it expects faults and stops them from turning into failures.",
        "Faults come in three families. Hardware faults are mostly random and independent, so redundancy (RAID, spare machines) handles them well. Software faults are correlated: the same bug can hit every node at once, which makes them more dangerous. Human errors, especially configuration changes, cause a large share of real outages.",
        "To limit human error: design APIs that make the right thing easy, give people sandboxes to experiment in, roll changes out gradually with fast rollback, and monitor everything. Some teams even inject faults on purpose to prove the tolerance machinery works.",
      ],
      anchor: "Fault = one part breaks. Failure = the user notices.",
      terms: ["fault", "failure", "fault tolerance", "chaos testing"],
    },
    recall: {
      q: "A single disk dies, but users notice nothing. What happened?",
      options: ["A fault that did not become a failure", "A failure that the users did not notice", "A software fault hidden by the cache", "A full outage that recovered by itself"],
      answer: 0,
      why: "The disk broke (a fault), but redundancy kept the system serving users, so there was no failure.",
    },
    quiz: [
      {
        q: "Why are software faults often more dangerous than hardware faults?",
        options: ["They are correlated, so many nodes can fail at once", "They are random, so they're hard to reproduce in tests", "They always corrupt data instead of crashing cleanly", "They can't be detected by any monitoring system"],
        answer: 0,
        why: "A bug is present on every node running that code, so the same trigger can take them all down together.",
      },
      {
        q: "Which change reduces human-error outages the most?",
        options: ["Gradual rollouts with quick rollback", "Requiring two people to approve every change", "Running every change at night when traffic is low", "Writing longer runbooks for the operators"],
        answer: 0,
        why: "If a bad change only reaches a few servers first and can be rolled back fast, a mistake stays small.",
      },
      {
        q: "What is the point of deliberately killing processes in production?",
        options: ["To prove the fault-tolerance machinery really works", "To measure how much load the servers can handle", "To clean up processes that leak memory over time", "To force the team to deploy more often"],
        answer: 0,
        why: "Fault handling that is never exercised tends to rot. Injecting faults keeps it tested.",
      },
    ],
    scenario: {
      title: "The Dark Gate", npc: "Captain of the Guard", scene: "castle",
      story: "Last night a guard pushed a config change to all 12 gate servers at once. Every gate went dark for an hour.",
      ask: "What do you recommend?",
      choices: [
        { text: "Roll out config changes to a few servers first, with a quick way to roll back.", correct: true, feedback: "Right. A gradual rollout turns a human mistake into a small fault instead of a castle-wide failure." },
        { text: "Buy RAID disks for every gate server so that no single failure can take a gate down again.", correct: false, feedback: "The disks were fine. This was a human error that spread everywhere at once." },
        { text: "Forbid all config changes until a full audit of every gate is done.", correct: false, feedback: "That makes the castle impossible to maintain. Make change safe instead of forbidding it." },
      ],
    },
  },
  {
    id: "1.2", chapter: 1, title: "Describing load", needs: [],
    card: {
      body: [
        "Before asking whether a system scales, describe its load with load parameters: requests per second, ratio of reads to writes, number of active users, cache hit rate. Pick the numbers that matter for your system.",
        "A classic example is a social home timeline. Approach A: on each read, look up everyone you follow and merge their posts. Approach B: when someone posts, push the post into each follower's precomputed timeline (fan-out on write). B makes reads cheap but writes expensive.",
        "So the key load parameter is how followers are distributed. A user with millions of followers turns one post into millions of writes. Many systems use a hybrid: fan-out for most users, merge-on-read for the few huge accounts.",
      ],
      anchor: "Scaling starts with a number: name your load parameter.",
      terms: ["load parameters", "fan-out", "read/write ratio"],
    },
    recall: {
      q: "With fan-out on write, what becomes expensive?",
      options: ["Posting, for users with many followers", "Reading the timeline of an inactive user", "Following a new account with few posts", "Storing each user's list of followers"],
      answer: 0,
      why: "Each post is copied into every follower's timeline, so the cost grows with the follower count.",
    },
    quiz: [
      {
        q: "A service gets 300k timeline reads/sec but only 5k posts/sec. What suits most users?",
        options: ["Precompute timelines at write time", "Merge everyone's posts each time a timeline is read", "Store every timeline only in the user's browser", "Disable caching so reads are always fresh"],
        answer: 0,
        why: "Reads vastly outnumber writes, so doing work once per write and making reads cheap pays off.",
      },
      {
        q: "Why can one celebrity break fan-out on write?",
        options: ["One post triggers millions of timeline writes", "Celebrities read their timelines far more often", "Their posts contain more media to store", "Their followers refresh the page more often"],
        answer: 0,
        why: "The work per post is proportional to the follower count.",
      },
      {
        q: "Which is NOT a typical load parameter?",
        options: ["The programming language used", "Requests per second", "Read/write ratio", "Number of simultaneously active users"],
        answer: 0,
        why: "Load parameters describe the work arriving at the system, not how it is implemented.",
      },
    ],
    scenario: {
      title: "The Mayor's Megaphone", npc: "Town Crier", scene: "market",
      story: "Our board fans each post out to followers. Every time the mayor (2 million followers) posts, the queue backs up for an hour.",
      ask: "How do you fix it?",
      choices: [
        { text: "Hybrid: fan out for normal posters, fetch the mayor's posts at read time and merge them in.", correct: true, feedback: "Exactly. Huge accounts are handled on read, everyone else on write." },
        { text: "Switch everyone to merge-on-read, so posting is cheap for all users.", correct: false, feedback: "Reads are far more frequent than posts. Every timeline load would become expensive." },
        { text: "Ask the mayor to post less often, and only in the quiet hours.", correct: false, feedback: "The system should handle its load, not ration its users." },
      ],
    },
  },
  {
    id: "1.3", chapter: 1, title: "Percentiles & tail latency", needs: ["1.2"],
    card: {
      body: [
        "Response time varies on every request, so treat it as a distribution, not one number. The median (p50) tells you what a typical request sees. The mean hides the shape of the distribution.",
        "The tail, p95, p99 and p999, shows the worst experiences. Slow requests often hit your most valuable users, who have the most data. When one page needs many backend calls, the slowest call decides how long the page takes, so the tail gets amplified.",
        "Service-level objectives are written with percentiles, such as 'p99 under 1 second'. Measure on the client side too: queueing delay happens before the server even starts working.",
      ],
      anchor: "The average lies. Ask for the p99.",
      terms: ["p50 / median", "p99 / tail latency", "tail amplification", "SLO"],
    },
    recall: {
      q: "Half of all requests are faster than which value?",
      options: ["The median (p50)", "The p99", "The mean", "The maximum"],
      answer: 0,
      why: "That is the definition of the median: 50% of requests are faster, 50% slower.",
    },
    quiz: [
      {
        q: "p99 = 1.5s means:",
        options: ["99% of requests finish in under 1.5s", "1% of requests take exactly 1.5s or more", "The average request takes about 1.5s", "The slowest request ever measured took 1.5s"],
        answer: 0,
        why: "The 99th percentile is the value that 99% of requests are faster than.",
      },
      {
        q: "A page makes 10 parallel calls, each with a 1% chance of being slow. Roughly how many page loads see a slow call?",
        options: ["About 10%", "About 1%", "About 0.1%", "About 50%"],
        answer: 0,
        why: "1 − 0.99¹⁰ ≈ 9.6%. Many calls per page amplify the tail.",
      },
      {
        q: "Why measure latency on the client side?",
        options: ["It includes queueing delay before the server starts", "Server clocks drift too much to be trusted for latency", "Client devices have more accurate monotonic clocks", "It moves the measurement cost off the servers"],
        answer: 0,
        why: "A request can wait in a queue long before the server's own timer starts.",
      },
    ],
    scenario: {
      title: "The Slow Shelves", npc: "Head Librarian", scene: "library",
      story: "The dashboard says the average book lookup takes 80ms, but patrons complain it often takes seconds.",
      ask: "Who is right?",
      choices: [
        { text: "Both. The mean hides a slow tail, so chart p95 and p99 too.", correct: true, feedback: "Yes. A small fraction of very slow requests barely moves the average." },
        { text: "The dashboard. An 80ms average means almost every lookup is fast.", correct: false, feedback: "Averages hide the shape of the distribution, including the slow tail." },
        { text: "The patrons. The dashboard must be measuring the wrong server.", correct: false, feedback: "The dashboard is probably right about the mean; the mean is the wrong number to watch." },
      ],
    },
  },
  {
    id: "1.4", chapter: 1, title: "Maintainability", needs: ["1.1"],
    card: {
      body: [
        "Most of software's cost comes after launch: fixing bugs, keeping it running, adapting it to new needs. Three design principles keep that cost down.",
        "Operability: make life easy for the people who run it, with good monitoring, automation, sensible defaults and predictable behaviour. Simplicity: remove accidental complexity with good abstractions so newcomers can understand the system. Evolvability: make change easy, because requirements always change.",
        "Accidental complexity is complexity that comes from the implementation rather than from the problem itself. It is the kind you can remove.",
      ],
      anchor: "Run it, read it, change it: operability, simplicity, evolvability.",
      terms: ["operability", "simplicity", "evolvability", "accidental complexity"],
    },
    recall: {
      q: "Which principle is about the people who keep the system running day to day?",
      options: ["Operability", "Simplicity", "Evolvability", "Scalability"],
      answer: 0,
      why: "Operability means making routine operations easy and safe.",
    },
    quiz: [
      {
        q: "Accidental complexity is...",
        options: ["Complexity from the implementation, not the problem", "Complexity added by unclear or changing requirements", "Any complexity caused by running on many machines", "The complexity inherent in the business domain"],
        answer: 0,
        why: "It is the complexity you could remove without changing what the system does.",
      },
      {
        q: "A good abstraction mainly serves which principle?",
        options: ["Simplicity", "Operability", "Reliability", "Load balancing"],
        answer: 0,
        why: "Abstractions hide detail behind a clean interface, which makes the system easier to understand.",
      },
      {
        q: "Product asks for a new feature every sprint and the code fights back. Which principle is suffering?",
        options: ["Evolvability", "Operability", "Fault tolerance", "Throughput"],
        answer: 0,
        why: "Evolvability is how easily the system can be changed.",
      },
    ],
    scenario: {
      title: "The Napkin Runbook", npc: "Royal Steward", scene: "castle",
      story: "Only one old engineer knows how to restart the treasury server, using 14 manual commands written on a napkin.",
      ask: "What should we do?",
      choices: [
        { text: "Automate the restart, document it, and add monitoring so anyone on call can handle it.", correct: true, feedback: "That's operability: routine tasks become easy and safe for anyone." },
        { text: "Give the old engineer a raise and ask him to train an apprentice someday.", correct: false, feedback: "Knowledge locked in one head is a fault waiting to become a failure." },
        { text: "Rewrite the whole treasury in a new language so it never needs restarting.", correct: false, feedback: "A rushed rewrite adds risk without fixing the operational gap." },
      ],
    },
  },
];
