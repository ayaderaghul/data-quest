export interface Question {
  q: string;
  options: string[];
  answer: number; // index into options
  why: string;
}

export interface Scenario {
  title: string;
  npc: string;
  scene: "castle" | "market" | "library" | "harbor" | "bakery" | "guild";
  story: string;
  ask: string;
  choices: { text: string; correct: boolean; feedback: string }[];
}

export interface Block {
  id: string; // e.g. "5.3"
  chapter: number;
  title: string;
  needs: string[]; // block ids that must be cleared first
  card: { body: string[]; anchor: string; terms: string[] };
  recall: Question; // the check at the end of the fundamental card
  quiz: Question[]; // three questions
  scenario: Scenario;
}

export interface Chapter {
  id: number;
  title: string;
  region: 1 | 2 | 3;
  needs: number[];
  available: boolean;
  gear: { slot: string; name: string };
  boss: { name: string; taunt: string };
  beast: string;
}
