export type InitResponse = {
  type: "init";
  postId: string;
  count: number;
  username: string;
};

export type IncrementResponse = {
  type: "increment";
  postId: string;
  count: number;
};

export type DecrementResponse = {
  type: "decrement";
  postId: string;
  count: number;
};

// shared/types/puzzle.ts
export interface Clue {
  clue: string;
  answer: string;
  found: boolean;
};

export interface Puzzle {
  theme: string;
  grid: string[][];
  clues: Clue[];
};