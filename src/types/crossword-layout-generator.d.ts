declare module "crossword-layout-generator" {
  interface RawClueInput {
    clue: string;
    answer: string;
  }
  interface RawLayoutEntry {
    clue: string;
    answer: string;
    startx?: number;
    starty?: number;
    orientation: string;
    position?: number;
  }
  interface RawLayout {
    rows: number;
    cols: number;
    result: RawLayoutEntry[];
    table?: unknown;
    table_string?: string;
  }
  function generateLayout(words: RawClueInput[]): RawLayout;
  const _default: { generateLayout: typeof generateLayout };
  export default _default;
}
