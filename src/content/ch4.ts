import type { Block } from "./types.js";

// Options are written with the correct answer first; the server shuffles them.
export const CH4: Block[] = [
  {
    id: "4.1", chapter: 4, title: "Backward & forward compatibility", needs: [],
    card: {
      body: [
        "Code changes roll out gradually. During a rolling upgrade some servers run the new version and some the old one, and mobile users may not update for months. So old and new code, and old and new data, live side by side.",
        "Backward compatibility: new code can read data written by old code. That is usually easy, because you know the old format. Forward compatibility: old code can read data written by new code. That is harder, because old code must ignore things it has never seen.",
        "A subtle trap: old code reads a record with a new field, updates it, and writes it back without the field. The new field silently disappears.",
      ],
      anchor: "Backward: new reads old. Forward: old reads new.",
      terms: ["backward compatibility", "forward compatibility", "rolling upgrade"],
    },
    recall: {
      q: "Old code reading data written by new code requires:",
      options: ["Forward compatibility", "Backward compatibility", "A migration", "Synchronous replication"],
      answer: 0,
      why: "Forward = older readers cope with newer data.",
    },
    quiz: [
      {
        q: "Why do old and new code versions run at the same time?",
        options: ["Rolling upgrades avoid downtime, so versions overlap", "Servers can't be restarted", "It is required by HTTP", "Compilers mix versions"],
        answer: 0,
        why: "Upgrading node by node keeps the service up but mixes versions.",
      },
      {
        q: "Forward compatibility is harder because:",
        options: ["Old code must handle fields it has never seen", "New code is slower", "Old data is encrypted", "Old code has fewer tests"],
        answer: 0,
        why: "You can't change old code after the fact; it must already be tolerant.",
      },
      {
        q: "Old code reads a record with a new field, edits it, and writes it back. The risk is:",
        options: ["The new field gets lost", "The record is duplicated", "The old code crashes the DB", "The schema is deleted"],
        answer: 0,
        why: "Unknown fields must be preserved, not dropped.",
      },
    ],
    scenario: {
      title: "The Vanishing Priority", npc: "Royal Messenger", scene: "castle",
      story: "We added a 'priority' field to messages. Old relay stations read each message, edit the route, and write it back. Priorities keep vanishing.",
      ask: "What's the fix?",
      choices: [
        { text: "Make the old stations keep unknown fields intact when rewriting messages.", correct: true, feedback: "Preserving unknown fields is what forward compatibility needs." },
        { text: "Remove the priority field.", correct: false, feedback: "Giving up on change isn't a strategy." },
        { text: "Shut every old station down at midnight at once.", correct: false, feedback: "A big-bang upgrade risks downtime and is rarely possible." },
      ],
    },
  },
  {
    id: "4.2", chapter: 4, title: "JSON, XML & CSV", needs: ["4.1"],
    card: {
      body: [
        "JSON, XML and CSV are human-readable and supported everywhere, which makes them great for exchanging data between organisations.",
        "They have traps. Numbers are vague: JSON doesn't distinguish integers from floats, and integers above 2^53 lose precision in JavaScript. Binary data must be Base64-encoded, which makes it about 33% bigger. Schemas are optional and complicated, and CSV has none at all.",
        "Binary JSON variants (MessagePack, BSON) save a little space, but they still repeat every field name in every record.",
      ],
      anchor: "Readable and universal, but vague about numbers and bytes.",
      terms: ["JSON", "Base64", "2^53 precision", "MessagePack"],
    },
    recall: {
      q: "Why is a 64-bit numeric ID risky in JSON read by JavaScript?",
      options: ["Numbers above 2^53 lose precision", "JSON can't store numbers", "IDs must be strings by law", "It makes the file binary"],
      answer: 0,
      why: "JavaScript numbers are 64-bit floats, exact only up to 2^53.",
    },
    quiz: [
      {
        q: "Base64 increases the size of binary data by about:",
        options: ["33%", "3%", "100%", "300%"],
        answer: 0,
        why: "Every 3 bytes become 4 characters.",
      },
      {
        q: "The biggest strength of JSON and XML is:",
        options: ["Everyone understands them, so they suit exchange between organisations", "They are the most compact", "They enforce schemas", "They are binary"],
        answer: 0,
        why: "Agreement on a format often matters more than efficiency.",
      },
      {
        q: "CSV's main weakness is:",
        options: ["No schema; the meaning of columns and escaping is up to each app", "It can't hold text", "It is binary", "It needs a database"],
        answer: 0,
        why: "Every consumer has to guess the conventions.",
      },
    ],
    scenario: {
      title: "The Off-by-One Citizens", npc: "Tax Collector", scene: "market",
      story: "Some citizen IDs come back from the web portal one digit off.",
      ask: "What's happening?",
      choices: [
        { text: "The IDs exceed 2^53. Send them as strings in the JSON.", correct: true, feedback: "That's how many large APIs ship 64-bit IDs." },
        { text: "Ask citizens to pick shorter IDs.", correct: false, feedback: "A creative solution, but not a technical one." },
        { text: "Round all IDs to the nearest thousand.", correct: false, feedback: "Now many citizens share one ID." },
      ],
    },
  },
  {
    id: "4.3", chapter: 4, title: "Protobuf & Thrift tags", needs: ["4.2"],
    card: {
      body: [
        "Thrift and Protocol Buffers need a schema. Each field has a tag number, and the encoded bytes contain the tag instead of the field name, so records are compact.",
        "Evolution follows from the tags. You can rename a field freely, but never change its tag. New fields get new tags; old code skips tags it doesn't know, using the type info to know how many bytes to skip (forward compatible).",
        "New fields must be optional or have defaults, so new code can read old records that lack them (backward compatible). A removed field's tag number must never be reused.",
      ],
      anchor: "The tag is the field's true name.",
      terms: ["tag number", "Protocol Buffers", "Thrift", "optional field"],
    },
    recall: {
      q: "In Protobuf, what identifies a field in the encoded bytes?",
      options: ["Its tag number", "Its name", "Its position in the file", "Its type only"],
      answer: 0,
      why: "Names live only in the schema; the bytes carry tags.",
    },
    quiz: [
      {
        q: "Which change is safe?",
        options: ["Renaming a field", "Changing a field's tag", "Reusing a deleted tag", "Adding a required field"],
        answer: 0,
        why: "Names aren't in the bytes, so renaming doesn't affect old data.",
      },
      {
        q: "A new field must be optional so that:",
        options: ["New code can read old records without it", "Old code runs faster", "Tags stay sorted", "The file gets smaller"],
        answer: 0,
        why: "Old records simply don't have the field.",
      },
      {
        q: "Old code meets an unknown tag. It:",
        options: ["Skips it, using the type to know its length", "Crashes", "Converts it to a string", "Deletes the record"],
        answer: 0,
        why: "That's what makes adding fields forward compatible.",
      },
    ],
    scenario: {
      title: "Tag Seven", npc: "Guild Scribe", scene: "guild",
      story: "We deleted field 7 ('nickname') last year. Now someone wants to reuse tag 7 for 'rank'.",
      ask: "What do you say?",
      choices: [
        { text: "Use a new tag number and never reuse 7.", correct: true, feedback: "Old records still contain tag 7 as a nickname." },
        { text: "Reuse 7, it's free now.", correct: false, feedback: "Old data would decode nicknames as ranks." },
        { text: "Renumber all the tags so they're tidy.", correct: false, feedback: "That breaks every existing record." },
      ],
    },
  },
  {
    id: "4.4", chapter: 4, title: "Avro schemas", needs: ["4.3"],
    card: {
      body: [
        "Avro also uses a schema but has no tag numbers. The bytes are just values in order, so they can only be decoded with the exact schema used to write them: the writer's schema.",
        "The reader decodes with its own reader's schema. Avro lines the two up by field name: fields missing from the writer's data get the reader's default, and extra writer fields are ignored.",
        "So you may only add or remove fields that have a default. Because there are no tags to assign by hand, Avro schemas can be generated automatically, for example from database tables.",
      ],
      anchor: "Avro: writer's schema + reader's schema, matched by name.",
      terms: ["writer's schema", "reader's schema", "schema resolution", "default value"],
    },
    recall: {
      q: "To decode Avro data you need:",
      options: ["The writer's schema", "Only the reader's schema", "Tag numbers", "Field names in each record"],
      answer: 0,
      why: "Without it you can't tell where one value ends and the next begins.",
    },
    quiz: [
      {
        q: "In a large Avro file, where is the writer's schema?",
        options: ["Stored once at the start of the file", "Repeated in every record", "Nowhere; it's guessed", "In each field's name"],
        answer: 0,
        why: "Including it once is cheap when the file holds millions of records.",
      },
      {
        q: "Adding a field in Avro is safe only if:",
        options: ["It has a default value", "It is a string", "It has a tag", "It is the last field"],
        answer: 0,
        why: "Readers fill in the default when old data lacks the field.",
      },
      {
        q: "Why is Avro handy for dumping database tables?",
        options: ["Schemas can be generated from tables, no tags to assign", "It stores SQL", "It is human-readable", "It needs no schema"],
        answer: 0,
        why: "Each column becomes a field by name.",
      },
    ],
    scenario: {
      title: "Ten Years of Scrolls", npc: "Archivist", scene: "library",
      story: "We have ten years of Avro files written with six different schema versions.",
      ask: "How do we read them all today?",
      choices: [
        { text: "Keep each file's writer's schema and resolve it against today's reader's schema.", correct: true, feedback: "That's Avro schema resolution doing its job." },
        { text: "Re-encode every file each time the schema changes.", correct: false, feedback: "Expensive and unnecessary." },
        { text: "Guess the schema from the bytes.", correct: false, feedback: "Avro bytes carry no field info, so guessing fails." },
      ],
    },
  },
  {
    id: "4.5", chapter: 4, title: "Dataflow: DB, RPC, messages", needs: ["4.1"],
    card: {
      body: [
        "Data flows between processes in three main ways. Through databases: one process encodes and writes, another later reads and decodes. Data outlives code, so a database holds records written by many past versions.",
        "Through services (REST or RPC): a client sends a request and waits for a reply. RPC tries to look like a local function call, but a network call can time out with an unknown result, and retries can run the same request twice.",
        "Through asynchronous messages via a broker: the sender doesn't wait. The broker buffers messages if the receiver is down, redelivers them, and can deliver one message to many consumers.",
      ],
      anchor: "Database, service call, message: three roads for data.",
      terms: ["REST", "RPC", "message broker", "idempotence"],
    },
    recall: {
      q: "Why is a network call not like a local function call?",
      options: ["It can time out with an unknown result", "It can't return values", "It is always faster", "It never fails"],
      answer: 0,
      why: "You can't tell whether a timed-out request was processed.",
    },
    quiz: [
      {
        q: "A message broker gives the sender:",
        options: ["Decoupling: it can send even if the receiver is down", "Faster CPUs", "A guaranteed reply", "Strong consistency"],
        answer: 0,
        why: "The broker buffers until the consumer is ready.",
      },
      {
        q: "After a timeout you know:",
        options: ["Nothing certain about whether it was processed", "It failed", "It succeeded", "It will retry itself"],
        answer: 0,
        why: "The request or the reply may have been lost.",
      },
      {
        q: "'Data outlives code' means:",
        options: ["A database may hold records written by many past versions", "Code is deleted first", "Data never changes", "Backups last forever"],
        answer: 0,
        why: "You deploy new code in minutes; old rows stay for years.",
      },
    ],
    scenario: {
      title: "Double Focaccia", npc: "Postmaster", scene: "bakery",
      story: "The bakery's ordering server sometimes times out, and the app retries. Now bakers get duplicate orders.",
      ask: "How do we stop duplicates?",
      choices: [
        { text: "Give each order a unique ID the server uses to ignore repeats (idempotence).", correct: true, feedback: "Then retrying is always safe." },
        { text: "Turn off retries completely.", correct: false, feedback: "Then timed-out orders are simply lost." },
        { text: "Raise the timeout to 10 minutes.", correct: false, feedback: "Users would wait, and timeouts would still happen." },
      ],
    },
  },
];
