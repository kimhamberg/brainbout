/**
 * AST-driven source instrumentation.
 *
 * Pipeline (single `ts.transform` pass, no text splicing):
 *
 *   1. Walk every node, ask each mutator for candidates. Each candidate is
 *      a (originalNode, replacementExpr) pair. After dedupe-by-overlap and
 *      ID assignment, the visitor rewrites that node to
 *        `($stryker_M(id) ? (replacement) : (original))`
 *      via `ts.factory.createConditionalExpression`.
 *
 *   2. Wrap every loop body with an iteration counter that throws after
 *      LOOP_GUARD_LIMIT iterations. Sync infinite-loop mutants thereby
 *      become `killed`, not hangs.
 *
 *   3. Lift every top-level `const X = expr;` whose RHS contains mutations
 *      into a `let X; X = expr;` pair (in the original statement position
 *      so subsequent top-level code sees the binding), plus a re-runnable
 *      `__stryker_init()` that re-evaluates the assignments between mutants.
 *
 *   4. Rewrite every relative import specifier to its absolute resolved path
 *      so the rewritten test files can resolve from any directory.
 *
 * Because every modification routes through the TypeScript factory + printer,
 * we can never emit text-corrupting splices ("Unexpected &&" / overlapping
 * ranges).  The printer is responsible for keeping the result parseable.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ALL_MUTATORS, type Candidate } from "./mutators";
import type { Mutation } from "./types";

export interface InstrumentResult {
  code: string;
  mutations: Mutation[];
}

/** Hard cap on iterations per loop entry. Real loops in this codebase top
 * out at a few thousand at most; 100k leaves comfortable headroom while
 * tripping a hung mutant well under the per-mutant timeout. */
const LOOP_GUARD_LIMIT = 100_000;

const MUTATOR_PRIORITY: Record<string, number> = {
  ArithmeticOperator: 100,
  AssignmentOperator: 95,
  EqualityOperator: 90,
  RelationalOperator: 80,
  LogicalOperator: 70,
  UpdateOperator: 68,
  OptionalChaining: 65,
  MethodExpression: 62,
  StringLiteral: 60,
  Regex: 58,
  NumericLiteral: 55,
  BooleanLiteral: 50,
  UnaryOperator: 45,
  ArrayDeclaration: 40,
  ObjectLiteral: 35,
  ArrowFunction: 30,
  ConditionalExpression: 10,
};

/* ─── context guards (keep mutations out of type-only / declaration land) ── */

function inTypeContext(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (
      ts.isTypeNode(cur) ||
      ts.isTypeAliasDeclaration(cur) ||
      ts.isInterfaceDeclaration(cur) ||
      ts.isTypeReferenceNode(cur) ||
      ts.isTypeLiteralNode(cur) ||
      ts.isUnionTypeNode(cur) ||
      ts.isIntersectionTypeNode(cur) ||
      ts.isLiteralTypeNode(cur) ||
      ts.isMappedTypeNode(cur) ||
      ts.isIndexedAccessTypeNode(cur) ||
      ts.isTemplateLiteralTypeNode(cur)
    ) return true;
    cur = cur.parent;
  }
  return false;
}

function inDeclarationContext(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isJSDoc(cur) || ts.isDecorator(cur)) return true;
    cur = cur.parent;
  }
  return false;
}

function isPropertyName(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  return (
    ((ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isEnumMember(parent)) &&
      parent.name === node) ||
    (ts.isShorthandPropertyAssignment(parent) && parent.name === node)
  );
}

function isInImportClauseName(node: ts.Node): boolean {
  const parent = node.parent;
  return parent
    ? ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)
    : false;
}

function eligibleForMutation(node: ts.Node): boolean {
  return (
    !inTypeContext(node) &&
    !inDeclarationContext(node) &&
    !isPropertyName(node) &&
    !isInImportClauseName(node)
  );
}

/* ─── collection pass ────────────────────────────────────────────────── */

interface CollectedMutation {
  candidate: Candidate;
  /** Pre-transform source position of `candidate.original`. */
  start: number;
  end: number;
  line: number;
  col: number;
}

/** Scan source text for ignore pragmas. Two forms:
 *
 *   // stryke-ignore-file        — skip every mutation in this file
 *   // stryke-ignore-next-line   — skip mutations in the *statement* that
 *                                  follows (handles multi-line calls)
 *
 * The pragma must appear as a substring of any line; surrounding text (e.g.
 * inside a doc comment) is fine. We deliberately don't parse comment kinds —
 * the substring check is robust and lets the pragma sit inside any comment
 * style or even a string literal (intentional escape hatch). */
interface IgnoreRules {
  fileIgnored: boolean;
  /** Byte ranges (statement extents) whose mutations should be dropped. */
  ranges: Array<[number, number]>;
}

function collectIgnoreRules(source: ts.SourceFile, code: string): IgnoreRules {
  const lines = code.split("\n");
  let fileIgnored = false;
  const pragmaLines: number[] = []; // 1-indexed
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.includes("stryke-ignore-file")) fileIgnored = true;
    if (line.includes("stryke-ignore-next-line")) pragmaLines.push(i + 1);
  }
  if (fileIgnored || pragmaLines.length === 0) {
    return { fileIgnored, ranges: [] };
  }

  // For each pragma line, find the first code-bearing line below it.
  const targetLines: number[] = [];
  for (const p of pragmaLines) {
    for (let j = p + 1; j <= lines.length; j++) {
      const t = (lines[j - 1] ?? "").trim();
      if (
        t === "" ||
        t.startsWith("//") ||
        t.startsWith("/*") ||
        t.startsWith("*")
      ) continue;
      targetLines.push(j);
      break;
    }
  }

  // Map each target line to the smallest enclosing statement; record its
  // full byte range so every mutation site within that statement is dropped.
  const ranges: Array<[number, number]> = [];
  for (const tl of targetLines) {
    const pos = source.getPositionOfLineAndCharacter(tl - 1, 0);
    let best: ts.Statement | undefined;
    const visit = (node: ts.Node): void => {
      if (node.getStart(source) <= pos && pos <= node.getEnd()) {
        if (ts.isStatement(node)) best = node;
        ts.forEachChild(node, visit);
      }
    };
    visit(source);
    if (best) ranges.push([best.getStart(source), best.getEnd()]);
  }
  return { fileIgnored, ranges };
}

function collect(source: ts.SourceFile): CollectedMutation[] {
  const raw: CollectedMutation[] = [];
  const visit = (node: ts.Node): void => {
    if (eligibleForMutation(node)) {
      for (const mutator of ALL_MUTATORS) {
        for (const c of mutator(node)) {
          const start = c.original.getStart(source);
          const end = c.original.getEnd();
          const lc = source.getLineAndCharacterOfPosition(start);
          raw.push({
            candidate: c,
            start,
            end,
            line: lc.line + 1,
            col: lc.character + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  // Resolve overlapping mutations by mutator priority. Two mutations at the
  // same byte range — keep the higher-priority one.
  const sorted = [...raw].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return b.end - a.end;
    return (
      (MUTATOR_PRIORITY[b.candidate.mutator] ?? 0) -
      (MUTATOR_PRIORITY[a.candidate.mutator] ?? 0)
    );
  });
  const accepted: CollectedMutation[] = [];
  for (const m of sorted) {
    const overlaps = accepted.some(
      (a) => m.start < a.end && m.end > a.start,
    );
    if (!overlaps) accepted.push(m);
  }
  return accepted;
}

/* ─── relative-import resolution ─────────────────────────────────────── */

function resolveRelative(spec: string, baseDir: string): string {
  const base = path.resolve(baseDir, spec);
  for (const ext of ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return base;
}

/* ─── transformer ────────────────────────────────────────────────────── */

function makeStrykerCall(id: number): ts.CallExpression {
  return ts.factory.createCallExpression(
    ts.factory.createIdentifier("$stryker_M"),
    undefined,
    [ts.factory.createNumericLiteral(String(id))],
  );
}

function wrapWithSwitch(
  id: number,
  original: ts.Expression,
  mutated: ts.Expression,
): ts.Expression {
  return ts.factory.createParenthesizedExpression(
    ts.factory.createConditionalExpression(
      makeStrykerCall(id),
      undefined,
      ts.factory.createParenthesizedExpression(mutated),
      undefined,
      ts.factory.createParenthesizedExpression(original),
    ),
  );
}

interface LoopGuardSlot {
  counter: string;
}

function nextCounterName(state: { n: number }): string {
  return `__sl_${String(state.n++)}`;
}

function makeGuardCheck(counter: string): ts.Statement {
  return ts.factory.createIfStatement(
    ts.factory.createBinaryExpression(
      ts.factory.createPrefixUnaryExpression(
        ts.SyntaxKind.PlusPlusToken,
        ts.factory.createIdentifier(counter),
      ),
      ts.SyntaxKind.GreaterThanToken,
      ts.factory.createNumericLiteral(String(LOOP_GUARD_LIMIT)),
    ),
    ts.factory.createThrowStatement(
      ts.factory.createNewExpression(
        ts.factory.createIdentifier("Error"),
        undefined,
        [ts.factory.createStringLiteral("STRYKE_LOOP_LIMIT " + counter)],
      ),
    ),
  );
}

function wrapLoopBody(body: ts.Statement, slot: LoopGuardSlot): ts.Statement {
  const check = makeGuardCheck(slot.counter);
  if (ts.isBlock(body)) {
    return ts.factory.updateBlock(body, [check, ...body.statements]);
  }
  return ts.factory.createBlock([check, body]);
}

function wrapLoopStatement(
  loop: ts.IterationStatement,
  newBody: ts.Statement,
  slot: LoopGuardSlot,
): ts.Statement {
  let updated: ts.IterationStatement;
  if (ts.isWhileStatement(loop)) {
    updated = ts.factory.updateWhileStatement(loop, loop.expression, newBody);
  } else if (ts.isDoStatement(loop)) {
    updated = ts.factory.updateDoStatement(loop, newBody, loop.expression);
  } else if (ts.isForStatement(loop)) {
    updated = ts.factory.updateForStatement(
      loop,
      loop.initializer,
      loop.condition,
      loop.incrementor,
      newBody,
    );
  } else if (ts.isForOfStatement(loop)) {
    updated = ts.factory.updateForOfStatement(
      loop,
      loop.awaitModifier,
      loop.initializer,
      loop.expression,
      newBody,
    );
  } else if (ts.isForInStatement(loop)) {
    updated = ts.factory.updateForInStatement(
      loop,
      loop.initializer,
      loop.expression,
      newBody,
    );
  } else {
    return loop;
  }
  // `{ let __sl_N = 0; <loop> }`
  return ts.factory.createBlock(
    [
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [
            ts.factory.createVariableDeclaration(
              slot.counter,
              undefined,
              undefined,
              ts.factory.createNumericLiteral("0"),
            ),
          ],
          ts.NodeFlags.Let,
        ),
      ),
      updated,
    ],
  );
}

/**
 * Build the main transformer. Returns a function that runs ts.transform with
 * mutation switches + loop guards. Static-init lifting is handled separately
 * by `liftTopLevel()` after this transform.
 */
function makeTransformer(
  mutationsByOriginal: Map<ts.Node, CollectedMutation & { id: number }>,
  importRewrites: Map<ts.Node, string>,
  loopCounter: { n: number },
): ts.TransformerFactory<ts.SourceFile> {
  return (context) => (sourceFile) => {
    const visit: ts.Visitor = (node) => {
      // Rewrite relative-import string literals.
      const importTarget = importRewrites.get(node);
      if (importTarget !== undefined && ts.isStringLiteral(node)) {
        return ts.factory.createStringLiteral(importTarget);
      }

      // Visit children first so nested mutations get wrapped before us.
      const visited = ts.visitEachChild(node, visit, context);

      // Loop body guards.
      if (
        ts.isWhileStatement(visited) ||
        ts.isDoStatement(visited) ||
        ts.isForStatement(visited) ||
        ts.isForOfStatement(visited) ||
        ts.isForInStatement(visited)
      ) {
        const slot: LoopGuardSlot = { counter: nextCounterName(loopCounter) };
        const wrappedBody = wrapLoopBody(visited.statement, slot);
        return wrapLoopStatement(visited, wrappedBody, slot);
      }

      // Mutation switch wrap.
      const m = mutationsByOriginal.get(node);
      if (m && (ts.isExpression(visited) || isWrappableLiteral(visited))) {
        return wrapWithSwitch(
          m.id,
          visited as ts.Expression,
          m.candidate.replacement,
        );
      }
      return visited;
    };
    return ts.visitNode(sourceFile, visit) as ts.SourceFile;
  };
}

/** TrueKeyword/FalseKeyword report as Token, not Expression — wrap anyway. */
function isWrappableLiteral(node: ts.Node): boolean {
  return (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  );
}

/* ─── top-level lifting ──────────────────────────────────────────────── */

function isExported(stmt: ts.VariableStatement): boolean {
  if (!stmt.modifiers) return false;
  for (const m of stmt.modifiers) {
    if (m.kind === ts.SyntaxKind.ExportKeyword) return true;
  }
  return false;
}

/** Build `let <name><: T>?;` as an AST statement. */
function makeLetDecl(
  name: string,
  type: ts.TypeNode | undefined,
): ts.VariableStatement {
  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [ts.factory.createVariableDeclaration(name, undefined, type, undefined)],
      ts.NodeFlags.Let,
    ),
  );
}

/** Build `<name> = <init>;` as an AST statement. */
function makeAssignStmt(
  name: string,
  init: ts.Expression,
): ts.ExpressionStatement {
  return ts.factory.createExpressionStatement(
    ts.factory.createAssignment(ts.factory.createIdentifier(name), init),
  );
}

/**
 * After the main transform, lift every top-level `const X = expr;` that
 * contains mutations into `let X;` + `X = expr;` (preserving source order),
 * plus emit an `export function __stryker_init() { ... }` that re-runs each
 * assignment between mutants. The whole result is a fresh `SourceFile`
 * printed once — no manual string concatenation.
 */
function liftTopLevel(
  transformedFile: ts.SourceFile,
  printer: ts.Printer,
  hasMutation: (stmt: ts.Statement) => boolean,
): string {
  const newStatements: ts.Statement[] = [];
  const initBody: ts.Statement[] = [];
  const exportNames: string[] = [];

  for (const stmt of transformedFile.statements) {
    if (
      ts.isVariableStatement(stmt) &&
      hasMutation(stmt) &&
      stmt.declarationList.declarations.length === 1
    ) {
      const decl = stmt.declarationList.declarations[0]!;
      if (ts.isIdentifier(decl.name) && decl.initializer) {
        const name = decl.name.text;
        newStatements.push(makeLetDecl(name, decl.type));
        newStatements.push(makeAssignStmt(name, decl.initializer));
        initBody.push(makeAssignStmt(name, decl.initializer));
        if (isExported(stmt)) exportNames.push(name);
        continue;
      }
    }
    newStatements.push(stmt);
  }

  const initFnBody =
    initBody.length > 0
      ? ts.factory.createBlock(initBody, true)
      : ts.factory.createBlock([], false);
  const initFn = ts.factory.createFunctionDeclaration(
    [ts.factory.createToken(ts.SyntaxKind.ExportKeyword)],
    undefined,
    "__stryker_init",
    undefined,
    [],
    ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
    initFnBody,
  );
  newStatements.push(initFn);

  if (exportNames.length > 0) {
    newStatements.push(
      ts.factory.createExportDeclaration(
        undefined,
        false,
        ts.factory.createNamedExports(
          exportNames.map((n) =>
            ts.factory.createExportSpecifier(false, undefined, n),
          ),
        ),
      ),
    );
  }

  const outFile = ts.factory.updateSourceFile(transformedFile, newStatements);
  return printer.printFile(outFile);
}

/* ─── public entry ───────────────────────────────────────────────────── */

export function instrumentFile(
  absPath: string,
  projectRoot: string,
  nextId: number,
): { result: InstrumentResult; nextId: number } {
  const code = readFileSync(absPath, "utf-8");
  const rel = path.relative(projectRoot, absPath);
  const source = ts.createSourceFile(
    rel,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  // 1. Collect + dedupe mutations. Honor `stryke-ignore-*` pragmas: file-
  //    level skips every mutation, next-line-level skips mutations inside
  //    the entire statement that follows the pragma.
  const ignore = collectIgnoreRules(source, code);
  let collected = ignore.fileIgnored ? [] : collect(source);
  if (ignore.ranges.length > 0) {
    collected = collected.filter(
      (c) => !ignore.ranges.some(([s, e]) => c.start >= s && c.end <= e),
    );
  }
  const printerInline = ts.createPrinter({ removeComments: false });
  const withIds: Array<CollectedMutation & { id: number }> = collected.map((c, i) => ({
    ...c,
    id: nextId + i,
  }));
  const mutations: Mutation[] = withIds.map((c) => ({
    id: c.id,
    file: rel,
    start: c.start,
    end: c.end,
    line: c.line,
    col: c.col,
    mutator: c.candidate.mutator,
    original: c.candidate.original.getText(source),
    replacement: printerInline.printNode(
      ts.EmitHint.Unspecified,
      c.candidate.replacement,
      source,
    ),
  }));

  const mutationsByOriginal = new Map<ts.Node, CollectedMutation & { id: number }>();
  for (const m of withIds) mutationsByOriginal.set(m.candidate.original, m);

  // 2. Build the import rewrite map.
  const importRewrites = new Map<ts.Node, string>();
  const dir = path.dirname(absPath);
  const visitImports = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith(".")
    ) {
      importRewrites.set(
        node.moduleSpecifier,
        resolveRelative(node.moduleSpecifier.text, dir),
      );
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text.startsWith(".")
    ) {
      importRewrites.set(
        node.arguments[0],
        resolveRelative(node.arguments[0].text, dir),
      );
    }
    ts.forEachChild(node, visitImports);
  };
  visitImports(source);

  // 3. Run the transformer.
  const loopCounter = { n: 0 };
  const transformer = makeTransformer(mutationsByOriginal, importRewrites, loopCounter);
  const transformed = ts.transform(source, [transformer]);
  const transformedFile = transformed.transformed[0] as ts.SourceFile;

  // 4. Lift top-level const declarations whose initializers contain mutations.
  const printer = ts.createPrinter({ removeComments: false });
  const stmtSourceRanges = new Map<ts.Statement, [number, number]>();
  source.statements.forEach((stmt, idx) => {
    stmtSourceRanges.set(transformedFile.statements[idx] ?? stmt, [
      stmt.getStart(source),
      stmt.getEnd(),
    ]);
  });
  const hasMutationInRange = (stmt: ts.Statement): boolean => {
    const range = stmtSourceRanges.get(stmt);
    if (!range) return false;
    const [s, e] = range;
    for (const m of withIds) if (m.start >= s && m.end <= e) return true;
    return false;
  };

  const finalCode = liftTopLevel(transformedFile, printer, hasMutationInRange);
  transformed.dispose();

  return {
    result: { code: finalCode, mutations },
    nextId: nextId + withIds.length,
  };
}
