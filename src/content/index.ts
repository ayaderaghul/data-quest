import type { Block, Question } from "./types.js";
import { CHAPTERS, REGIONS } from "./chapters.js";
import { CH1 } from "./ch1.js";
import { CH2 } from "./ch2.js";
import { CH3 } from "./ch3.js";
import { CH4 } from "./ch4.js";
import { CH5 } from "./ch5.js";

export { CHAPTERS, REGIONS };
export const BLOCKS: Block[] = [...CH1, ...CH2, ...CH3, ...CH4, ...CH5];
export const BLOCK_BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));

/** A reference to one question: "<blockId>:recall" or "<blockId>:quiz:<n>". */
export type QRef = string;

export function getQuestion(ref: QRef): Question | undefined {
  const [blockId, kind, n] = ref.split(":");
  const block = BLOCK_BY_ID.get(blockId);
  if (!block) return undefined;
  if (kind === "recall") return block.recall;
  if (kind === "quiz") return block.quiz[Number(n)];
  return undefined;
}

export function questionRefs(blockIds: string[]): QRef[] {
  const refs: QRef[] = [];
  for (const id of blockIds) {
    const b = BLOCK_BY_ID.get(id);
    if (!b) continue;
    refs.push(`${id}:recall`);
    b.quiz.forEach((_, i) => refs.push(`${id}:quiz:${i}`));
  }
  return refs;
}

export interface Rival {
  id: string;
  name: string;
  title: string;
  chapter: number;
  speed: number; // mean seconds to answer
  accuracy: number; // probability of answering correctly
  taunt: string;
  weeklyBase: number; // leaderboard gold by end of week
  colour: string;
}

export const RIVALS: Rival[] = [
  { id: "nines", name: "Lady Nines", title: "The Perfectionist", chapter: 1, speed: 9, accuracy: 0.9, taunt: "Five nines or nothing, squire.", weeklyBase: 250, colour: "#e8ecf5" },
  { id: "schema", name: "Sir Schema", title: "The Strict", chapter: 2, speed: 7, accuracy: 0.8, taunt: "Everything has its place. Even you.", weeklyBase: 190, colour: "#c9b8ff" },
  { id: "vector", name: "Knight Vector", title: "The Bookish", chapter: 3, speed: 10, accuracy: 0.95, taunt: "I've read the storage chapter four times. Have you?", weeklyBase: 420, colour: "#2e8b57" },
  { id: "avro", name: "Baron Avro", title: "The Translator", chapter: 4, speed: 6, accuracy: 0.75, taunt: "I speak every format. Do you?", weeklyBase: 310, colour: "#ff9b5e" },
  { id: "quorum", name: "Sir Quorum", title: "The Diplomat", chapter: 5, speed: 7, accuracy: 0.8, taunt: "Two out of three agree: I win.", weeklyBase: 680, colour: "#5ee6eb" },
  { id: "shard", name: "Dame Shard", title: "The Hasty", chapter: 6, speed: 4, accuracy: 0.6, taunt: "Split it, ship it!", weeklyBase: 580, colour: "#ff6b8a" },
  { id: "paxos", name: "Lady Paxos", title: "The Paranoid", chapter: 8, speed: 8, accuracy: 0.95, taunt: "Your clock is lying to you.", weeklyBase: 800, colour: "#8e44ad" },
  { id: "raft", name: "Baron Raft", title: "The Elected", chapter: 9, speed: 6, accuracy: 0.9, taunt: "The majority voted. I lead.", weeklyBase: 900, colour: "#b0413e" },
];
