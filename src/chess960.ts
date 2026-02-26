// src/chess960.ts

export function chess960Backrank(id: number): string[] {
  const pieces = new Array<string | null>(8).fill(null);

  // 1. Light-square bishop: files b(1), d(3), f(5), h(7)
  pieces[(id % 4) * 2 + 1] = "B";
  let n = Math.floor(id / 4);

  // 2. Dark-square bishop: files a(0), c(2), e(4), g(6)
  pieces[(n % 4) * 2] = "B";
  n = Math.floor(n / 4);

  // 3. Queen placed in nth empty square (0-5)
  const q = n % 6;
  let count = 0;
  for (let i = 0; i < 8; i++) {
    if (pieces[i] === null) {
      if (count === q) {
        pieces[i] = "Q";
        break;
      }
      count++;
    }
  }
  n = Math.floor(n / 6);

  // 4. Two knights — n encodes which 2 of 5 remaining squares
  const knightTable = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 3],
    [2, 4],
    [3, 4],
  ];
  const [kn1, kn2] = knightTable[n];
  count = 0;
  for (let i = 0; i < 8; i++) {
    if (pieces[i] === null) {
      if (count === kn1 || count === kn2) {
        pieces[i] = "N";
      }
      count++;
    }
  }

  // 5. Remaining 3 squares: R, K, R (left to right)
  const rkr = ["R", "K", "R"];
  let ri = 0;
  for (let i = 0; i < 8; i++) {
    if (pieces[i] === null) {
      pieces[i] = rkr[ri];
      ri += 1;
    }
  }

  // All null slots filled — safe to assert as string[]
  return pieces as string[];
}

export function chess960Fen(id: number): { fen: string; id: number } {
  const backrank = chess960Backrank(id);
  const blackRank = backrank.map((p) => p.toLowerCase()).join("");
  const whiteRank = backrank.join("");

  const rookFiles: string[] = [];
  for (let i = 0; i < 8; i++) {
    if (backrank[i] === "R") {
      rookFiles.push(String.fromCharCode(65 + i)); // A-H
    }
  }
  // Rightmost rook file first (kingside), then leftmost (queenside)
  const castling =
    rookFiles[1] +
    rookFiles[0] +
    rookFiles[1].toLowerCase() +
    rookFiles[0].toLowerCase();

  const fen = `${blackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteRank} w ${castling} - 0 1`;
  return { fen, id };
}

export function randomChess960(): { fen: string; id: number } {
  const id = Math.floor(Math.random() * 960);
  return chess960Fen(id);
}
