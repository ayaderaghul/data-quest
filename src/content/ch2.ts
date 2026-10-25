import type { Block } from "./types.js";

// Options are written with the correct answer first; the server shuffles them.
export const CH2: Block[] = [
  {
    id: "2.1", chapter: 2, title: "Relational vs document", needs: [],
    card: {
      body: [
        "The relational model stores data in tables of rows and lets you combine them with joins. The document model stores self-contained JSON-like documents, often with related data nested inside.",
        "Documents shine for one-to-many, tree-shaped data such as a résumé: one person, many jobs, many schools, all fetched in a single read. Keeping a whole document together on disk is called locality.",
        "Relational shines when data is interconnected: many-to-one and many-to-many relationships need joins. Updating a small field in a big document usually rewrites the whole document. Today many databases support both styles.",
      ],
      anchor: "Tree-shaped? Document. Web-shaped? Relational (or graph).",
      terms: ["relational model", "document model", "locality", "one-to-many"],
    },
    recall: {
      q: "Which data fits the document model best?",
      options: ["A profile with a nested list of jobs and schools", "A social graph of who follows whom", "Seat bookings shared by many trains and stations", "Bank transfers moving money between accounts"],
      answer: 0,
      why: "It is a self-contained tree that is usually read all at once.",
    },
    quiz: [
      {
        q: "'Locality' in a document database means:",
        options: ["The whole document is stored together, so one read fetches it", "Documents are stored in the data centre nearest the user", "Each field of the document is stored in its own file", "Recently used documents are cached in the browser"],
        answer: 0,
        why: "Storing the document as one unit avoids multiple lookups when you need all of it.",
      },
      {
        q: "What does the document model handle poorly?",
        options: ["Many-to-many relationships", "Deeply nested lists of items", "Reading a whole record in one go", "Records whose fields vary a lot"],
        answer: 0,
        why: "Without good join support, the application has to stitch related documents together itself.",
      },
      {
        q: "Updating one small field in a large document usually means:",
        options: ["Rewriting the entire document", "Updating only the bytes that changed", "Creating a new version in a separate table", "Locking every document in the collection"],
        answer: 0,
        why: "Most document stores rewrite the full document on update, so keep documents reasonably small.",
      },
    ],
    scenario: {
      title: "The Skill Registry", npc: "Guildmaster", scene: "guild",
      story: "Each member's profile is a document with a list of skill names. Now we want every member with a given skill, and to rename skills everywhere.",
      ask: "What should we change?",
      choices: [
        { text: "Move skills into their own collection and reference them by ID.", correct: true, feedback: "Yes. The data became many-to-many, so normalise it and join." },
        { text: "Copy the skill name into every profile and update them all with a script.", correct: false, feedback: "Duplicated names drift out of sync as soon as one copy is missed." },
        { text: "Put the whole guild into one big document so everything is in one place.", correct: false, feedback: "Every update would rewrite everything, and the document would grow forever." },
      ],
    },
  },
  {
    id: "2.2", chapter: 2, title: "Normalisation & joins", needs: ["2.1"],
    card: {
      body: [
        "Instead of storing the text 'Greater Seattle Area' in every profile, store a region ID and keep the name in one place. That is normalisation: one source of truth, so a change happens once.",
        "The ID means nothing to humans, so it never needs to change. Human-readable text does change. The cost of normalising is that reading a profile now needs a join, or several lookups.",
        "If the database has weak join support, the application performs the joins with extra queries. As apps grow, data tends to become more interconnected, so joins matter more over time.",
      ],
      anchor: "Store the name once, point to it everywhere.",
      terms: ["normalisation", "many-to-one", "join", "foreign key"],
    },
    recall: {
      q: "Why store a region ID instead of the region's name?",
      options: ["So the name lives in one place and changes once", "Because IDs take up less space than names", "Because text names can't be indexed", "So the region name stays private"],
      answer: 0,
      why: "Duplicated text must be updated everywhere; an ID points to the single copy.",
    },
    quiz: [
      {
        q: "Normalising data mainly reduces:",
        options: ["Duplication and inconsistent updates", "The total number of tables needed", "Disk seeks for every query", "The need for secondary indexes"],
        answer: 0,
        why: "One copy of each fact means it can't disagree with itself.",
      },
      {
        q: "In a database with no join support, who does the join?",
        options: ["The application, with several queries", "The database's query optimiser", "Nobody; joins become impossible", "The load balancer in front of the database"],
        answer: 0,
        why: "The work moves into application code.",
      },
      {
        q: "Which is a many-to-one relationship?",
        options: ["Many profiles share one region", "One profile lists many past jobs", "One user has one password hash", "Many users follow many other users"],
        answer: 0,
        why: "Many rows point to the same single row.",
      },
    ],
    scenario: {
      title: "The Renamed Pepper", npc: "Spice Merchant", scene: "market",
      story: "I renamed 'Hai Phong pepper' to 'Haiphong pepper', but half the orders on my screens still show the old name.",
      ask: "What went wrong?",
      choices: [
        { text: "The name was copied into each order. Store the product ID and look up the current name.", correct: true, feedback: "Right. Keep the name in one place and reference it by ID." },
        { text: "Run a nightly script that searches all orders for the old name.", correct: false, feedback: "It patches symptoms and misses spellings. Fix the duplication instead." },
        { text: "Tell customers both names mean the same product.", correct: false, feedback: "The data stays inconsistent, and the next rename makes it worse." },
      ],
    },
  },
  {
    id: "2.3", chapter: 2, title: "Schema-on-read vs write", needs: ["2.1"],
    card: {
      body: [
        "'Schemaless' document databases still have a schema. It is implicit: the code that reads the data assumes a structure. This is schema-on-read, much like dynamic typing.",
        "Relational databases enforce schema-on-write: the database checks the structure when data is written, much like static typing.",
        "Changing the format shows the difference. With schema-on-read you write new records in the new shape and handle both shapes in code. With schema-on-write you run a migration such as ALTER TABLE plus a backfill.",
      ],
      anchor: "Schemaless means the schema lives in your code.",
      terms: ["schema-on-read", "schema-on-write", "migration"],
    },
    recall: {
      q: "Schema-on-read is most like:",
      options: ["Dynamic typing", "Static typing", "Garbage collection", "Ahead-of-time compilation"],
      answer: 0,
      why: "Structure is only checked when the data is used.",
    },
    quiz: [
      {
        q: "You split 'name' into 'first' and 'last'. With schema-on-read you typically:",
        options: ["Handle both shapes in the reading code", "Run ALTER TABLE before writing anything new", "Delete the old records and import them again", "Ask the database to convert documents on read"],
        answer: 0,
        why: "Old documents stay as they are; the reader copes with both.",
      },
      {
        q: "Schema-on-write is especially useful when:",
        options: ["You want the database to reject malformed data", "Records come from many sources with different shapes", "You don't know the structure of the data in advance", "You want to change formats without any migration"],
        answer: 0,
        why: "The database acts as a gatekeeper for structure.",
      },
      {
        q: "Schema-on-read helps most when:",
        options: ["Records come from many sources with differing structures", "Every record has exactly the same fields", "You need foreign keys between tables", "You need strict validation on every write"],
        answer: 0,
        why: "Heterogeneous data is hard to force into one rigid table.",
      },
    ],
    scenario: {
      title: "Forty Abbeys", npc: "Archivist", scene: "library",
      story: "We receive catalogue entries from 40 abbeys, each with slightly different fields.",
      ask: "How should we store them?",
      choices: [
        { text: "Store them as documents and normalise the shapes in the reading code.", correct: true, feedback: "Schema-on-read fits heterogeneous sources well." },
        { text: "Reject every entry that doesn't match one strict table, so the catalogue stays perfectly clean.", correct: false, feedback: "You'd lose most of the catalogue." },
        { text: "Ask all 40 abbeys to switch to one shared format first.", correct: false, feedback: "You rarely control external data sources." },
      ],
    },
  },
  {
    id: "2.4", chapter: 2, title: "Declarative queries & graphs", needs: ["2.2"],
    card: {
      body: [
        "SQL is declarative: you describe the result you want and the query optimiser decides how to get it. That lets the database add indexes or run in parallel without you rewriting queries.",
        "Imperative code spells out every step and its order, which makes it hard for the system to optimise or parallelise.",
        "When many-to-many relationships dominate, such as social networks or road maps, graph models fit naturally: vertices and edges, with languages like Cypher or SPARQL that follow paths of any length.",
      ],
      anchor: "Declarative: say what, not how.",
      terms: ["declarative", "query optimiser", "graph model", "Cypher"],
    },
    recall: {
      q: "Why can a database optimise SQL more easily than imperative code?",
      options: ["SQL describes the result, not the steps", "SQL has been optimised for decades longer", "SQL queries always run on a single core", "Imperative code can't use any indexes"],
      answer: 0,
      why: "Freedom over 'how' is what lets the optimiser choose a better plan.",
    },
    quiz: [
      {
        q: "Which data is the best fit for a graph model?",
        options: ["People who know people who live in cities in countries", "A list of invoices for each month of the year", "A single user's settings and preferences", "Temperature readings from one sensor over time"],
        answer: 0,
        why: "Densely connected many-to-many data with variable-length paths is graph territory.",
      },
      {
        q: "A big advantage of declarative languages is:",
        options: ["The engine can choose indexes and parallelism for you", "Queries are always shorter to write than code", "They work without a database server", "They make bugs in queries impossible"],
        answer: 0,
        why: "Separating 'what' from 'how' leaves room for the engine to improve the 'how'.",
      },
      {
        q: "Following 'located in' edges of unknown depth (city → region → country) is easiest in:",
        options: ["A graph query language", "A CSV file with one row per edge", "A key-value store keyed by city", "A spreadsheet with a column per level"],
        answer: 0,
        why: "Graph languages express 'follow this edge any number of times' directly.",
      },
    ],
    scenario: {
      title: "The Tangled Routes", npc: "Harbormaster", scene: "harbor",
      story: "Ships, ports, routes and cargo all link to each other. 'Which goods can reach Venice in 3 hops?' is a nightmare in our tables.",
      ask: "What do you suggest?",
      choices: [
        { text: "Model it as a graph and query paths with a graph language.", correct: true, feedback: "Yes. Variable-length paths are exactly what graph queries are for." },
        { text: "Add another join table for each number of hops you want to ask about.", correct: false, feedback: "That explodes as soon as someone asks about 4 or 5 hops." },
        { text: "Export everything to a spreadsheet and filter the routes by hand.", correct: false, feedback: "That only moves the tangle somewhere less powerful." },
      ],
    },
  },
];
