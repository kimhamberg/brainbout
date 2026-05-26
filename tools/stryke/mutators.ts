/**
 * Mutator catalog. Each mutator inspects an AST node and emits zero or more
 * candidate mutations. A candidate carries the *original* node and a
 * factory-built replacement expression — the instrumenter wraps that pair in
 *   `($stryker_M(id) ? (replacement) : (original))`
 * via `ts.factory.createConditionalExpression`. No text splicing.
 */

import ts from "typescript";

export interface Candidate {
  /** Human-readable mutator name (e.g. "EqualityOperator"). */
  mutator: string;
  /** Source-original node we mutate. */
  original: ts.Node;
  /** Replacement expression (a fresh AST node). */
  replacement: ts.Expression;
}

export type MutatorFn = (node: ts.Node) => Candidate[];

/* ─── binary-operator mutators ────────────────────────────────────────── */

const EQUALITY_FLIP: Record<string, ts.BinaryOperator> = {
  "===": ts.SyntaxKind.ExclamationEqualsEqualsToken,
  "!==": ts.SyntaxKind.EqualsEqualsEqualsToken,
  "==": ts.SyntaxKind.ExclamationEqualsToken,
  "!=": ts.SyntaxKind.EqualsEqualsToken,
};

const ARITH_FLIP: Record<string, ts.BinaryOperator> = {
  "+": ts.SyntaxKind.MinusToken,
  "-": ts.SyntaxKind.PlusToken,
  "*": ts.SyntaxKind.SlashToken,
  "/": ts.SyntaxKind.AsteriskToken,
  "%": ts.SyntaxKind.AsteriskToken,
};

const LOGICAL_FLIP: Record<string, ts.BinaryOperator> = {
  "&&": ts.SyntaxKind.BarBarToken,
  "||": ts.SyntaxKind.AmpersandAmpersandToken,
  "??": ts.SyntaxKind.AmpersandAmpersandToken,
};

const RELATIONAL_FLIP: Record<string, ts.BinaryOperator> = {
  "<": ts.SyntaxKind.GreaterThanEqualsToken,
  "<=": ts.SyntaxKind.GreaterThanToken,
  ">": ts.SyntaxKind.LessThanEqualsToken,
  ">=": ts.SyntaxKind.LessThanToken,
};

function makeBinary(
  name: string,
  table: Record<string, ts.BinaryOperator>,
): MutatorFn {
  return (node) => {
    if (!ts.isBinaryExpression(node)) return [];
    const op = node.operatorToken.getText();
    const flip = table[op];
    if (flip === undefined) return [];
    const replacement = ts.factory.createBinaryExpression(
      node.left,
      flip,
      node.right,
    );
    return [{ mutator: name, original: node, replacement }];
  };
}

export const equalityMutator = makeBinary("EqualityOperator", EQUALITY_FLIP);
export const arithmeticMutator = makeBinary("ArithmeticOperator", ARITH_FLIP);
export const logicalMutator = makeBinary("LogicalOperator", LOGICAL_FLIP);
export const relationalMutator = makeBinary("RelationalOperator", RELATIONAL_FLIP);

/* ─── literal mutators ────────────────────────────────────────────────── */

/** Replace non-empty string literals with `""`. Skips import/export specs. */
export const stringLiteralMutator: MutatorFn = (node) => {
  if (!ts.isStringLiteral(node)) return [];
  if (node.text === "") return [];
  const parent = node.parent;
  if (
    parent &&
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent))
  ) return [];
  return [
    {
      mutator: "StringLiteral",
      original: node,
      replacement: ts.factory.createStringLiteral(""),
    },
  ];
};

/** Flip boolean literals. */
export const booleanLiteralMutator: MutatorFn = (node) => {
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return [
      {
        mutator: "BooleanLiteral",
        original: node,
        replacement: ts.factory.createFalse(),
      },
    ];
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return [
      {
        mutator: "BooleanLiteral",
        original: node,
        replacement: ts.factory.createTrue(),
      },
    ];
  }
  return [];
};

/** Force conditional expressions in if/while/for/ternary to `true` then `false`. */
export const conditionalMutator: MutatorFn = (node) => {
  const out: Candidate[] = [];
  const push = (cond: ts.Expression): void => {
    out.push(
      {
        mutator: "ConditionalExpression",
        original: cond,
        replacement: ts.factory.createTrue(),
      },
      {
        mutator: "ConditionalExpression",
        original: cond,
        replacement: ts.factory.createFalse(),
      },
    );
  };
  if (ts.isIfStatement(node)) push(node.expression);
  else if (ts.isWhileStatement(node)) push(node.expression);
  else if (ts.isDoStatement(node)) push(node.expression);
  else if (ts.isForStatement(node) && node.condition) push(node.condition);
  else if (ts.isConditionalExpression(node)) push(node.condition);
  return out;
};

/** Drop the `?.` from optional chains. */
export const optionalChainingMutator: MutatorFn = (node) => {
  if (ts.isPropertyAccessExpression(node) && node.questionDotToken) {
    return [
      {
        mutator: "OptionalChaining",
        original: node,
        replacement: ts.factory.createPropertyAccessExpression(
          node.expression,
          node.name,
        ),
      },
    ];
  }
  if (ts.isElementAccessExpression(node) && node.questionDotToken) {
    return [
      {
        mutator: "OptionalChaining",
        original: node,
        replacement: ts.factory.createElementAccessExpression(
          node.expression,
          node.argumentExpression,
        ),
      },
    ];
  }
  if (ts.isCallExpression(node) && node.questionDotToken) {
    return [
      {
        mutator: "OptionalChaining",
        original: node,
        replacement: ts.factory.createCallExpression(
          node.expression,
          node.typeArguments,
          node.arguments,
        ),
      },
    ];
  }
  return [];
};

/** Replace numeric literals with 0, 1, -1 (skipping the original value). */
export const numericLiteralMutator: MutatorFn = (node) => {
  if (!ts.isNumericLiteral(node)) return [];
  const text = node.text;
  const out: Candidate[] = [];
  for (const c of ["0", "1", "-1"]) {
    if (c === text) continue;
    const repl: ts.Expression = c.startsWith("-")
      ? ts.factory.createPrefixUnaryExpression(
          ts.SyntaxKind.MinusToken,
          ts.factory.createNumericLiteral(c.slice(1)),
        )
      : ts.factory.createNumericLiteral(c);
    out.push({ mutator: "NumericLiteral", original: node, replacement: repl });
  }
  return out;
};

/** Replace non-empty array literals with `[]`. Skips destructuring targets. */
export const arrayDeclarationMutator: MutatorFn = (node) => {
  if (!ts.isArrayLiteralExpression(node)) return [];
  if (node.elements.length === 0) return [];
  const parent = node.parent;
  if (
    parent &&
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) return [];
  if (parent && ts.isForOfStatement(parent) && parent.initializer === node) {
    return [];
  }
  return [
    {
      mutator: "ArrayDeclaration",
      original: node,
      replacement: ts.factory.createArrayLiteralExpression([]),
    },
  ];
};

/* ─── compound-assignment mutators ───────────────────────────────────── */

const ASSIGN_FLIP: Record<string, ts.BinaryOperator> = {
  "+=": ts.SyntaxKind.MinusEqualsToken,
  "-=": ts.SyntaxKind.PlusEqualsToken,
  "*=": ts.SyntaxKind.SlashEqualsToken,
  "/=": ts.SyntaxKind.AsteriskEqualsToken,
  "%=": ts.SyntaxKind.AsteriskEqualsToken,
  "<<=": ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ">>=": ts.SyntaxKind.LessThanLessThanEqualsToken,
  "&=": ts.SyntaxKind.BarEqualsToken,
  "|=": ts.SyntaxKind.AmpersandEqualsToken,
  "&&=": ts.SyntaxKind.BarBarEqualsToken,
  "||=": ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  "??=": ts.SyntaxKind.AmpersandAmpersandEqualsToken,
};

export const assignmentMutator: MutatorFn = (node) => {
  if (!ts.isBinaryExpression(node)) return [];
  const op = node.operatorToken.getText();
  const flip = ASSIGN_FLIP[op];
  if (flip === undefined) return [];
  return [
    {
      mutator: "AssignmentOperator",
      original: node,
      replacement: ts.factory.createBinaryExpression(node.left, flip, node.right),
    },
  ];
};

/* ─── arrow-function body mutator (expression bodies only) ──────────── */

/** `(x) => x.foo` → `(x) => undefined`. Block-bodied arrows are left to the
 * still-missing block-statement mutator (needs statement-level placement). */
export const arrowFunctionMutator: MutatorFn = (node) => {
  if (!ts.isArrowFunction(node)) return [];
  if (ts.isBlock(node.body)) return [];
  return [
    {
      mutator: "ArrowFunction",
      original: node.body,
      replacement: ts.factory.createIdentifier("undefined"),
    },
  ];
};

/* ─── method-name swap ───────────────────────────────────────────────── */

const METHOD_FLIP: Record<string, string> = {
  endsWith: "startsWith",
  startsWith: "endsWith",
  every: "some",
  some: "every",
  filter: "map",
  map: "filter",
  charAt: "charCodeAt",
  charCodeAt: "charAt",
  toLowerCase: "toUpperCase",
  toUpperCase: "toLowerCase",
  trimStart: "trimEnd",
  trimEnd: "trimStart",
  trimLeft: "trimRight",
  trimRight: "trimLeft",
  min: "max",
  max: "min",
};

export const methodExpressionMutator: MutatorFn = (node) => {
  if (!ts.isCallExpression(node)) return [];
  if (!ts.isPropertyAccessExpression(node.expression)) return [];
  const name = node.expression.name.text;
  const flip = METHOD_FLIP[name];
  if (flip === undefined) return [];
  const newAccess = ts.factory.createPropertyAccessExpression(
    node.expression.expression,
    flip,
  );
  return [
    {
      mutator: "MethodExpression",
      original: node,
      replacement: ts.factory.createCallExpression(
        newAccess,
        node.typeArguments,
        node.arguments,
      ),
    },
  ];
};

/* ─── object literal collapse ────────────────────────────────────────── */

export const objectLiteralMutator: MutatorFn = (node) => {
  if (!ts.isObjectLiteralExpression(node)) return [];
  if (node.properties.length === 0) return [];
  // Skip destructuring targets in assignments.
  const parent = node.parent;
  if (
    parent &&
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) return [];
  return [
    {
      mutator: "ObjectLiteral",
      original: node,
      replacement: ts.factory.createObjectLiteralExpression([], false),
    },
  ];
};

/* ─── regex literal mutator ──────────────────────────────────────────── */

// Swap any regex literal for `/.*/` — matches everything, almost certainly
// breaks any caller that relied on the original pattern.
export const regexMutator: MutatorFn = (node) => {
  if (!ts.isRegularExpressionLiteral(node)) return [];
  if (node.text === "/.*/" || node.text === "/.*/g") return [];
  return [
    {
      mutator: "Regex",
      original: node,
      replacement: ts.factory.createRegularExpressionLiteral("/.*/"),
    },
  ];
};

/* ─── prefix unary operator (`+x`/`-x`/`~x`) ─────────────────────────── */

export const unaryOperatorMutator: MutatorFn = (node) => {
  if (!ts.isPrefixUnaryExpression(node)) return [];
  let flip: ts.PrefixUnaryOperator | undefined;
  switch (node.operator) {
    case ts.SyntaxKind.PlusToken:
      flip = ts.SyntaxKind.MinusToken;
      break;
    case ts.SyntaxKind.MinusToken:
      flip = ts.SyntaxKind.PlusToken;
      break;
    default:
      return [];
  }
  return [
    {
      mutator: "UnaryOperator",
      original: node,
      replacement: ts.factory.createPrefixUnaryExpression(flip, node.operand),
    },
  ];
};

/* ─── update operator (`++`/`--`, prefix and postfix) ────────────────── */

export const updateOperatorMutator: MutatorFn = (node) => {
  if (ts.isPrefixUnaryExpression(node)) {
    if (
      node.operator !== ts.SyntaxKind.PlusPlusToken &&
      node.operator !== ts.SyntaxKind.MinusMinusToken
    ) return [];
    const flip =
      node.operator === ts.SyntaxKind.PlusPlusToken
        ? ts.SyntaxKind.MinusMinusToken
        : ts.SyntaxKind.PlusPlusToken;
    return [
      {
        mutator: "UpdateOperator",
        original: node,
        replacement: ts.factory.createPrefixUnaryExpression(flip, node.operand),
      },
    ];
  }
  if (ts.isPostfixUnaryExpression(node)) {
    const flip =
      node.operator === ts.SyntaxKind.PlusPlusToken
        ? ts.SyntaxKind.MinusMinusToken
        : ts.SyntaxKind.PlusPlusToken;
    return [
      {
        mutator: "UpdateOperator",
        original: node,
        replacement: ts.factory.createPostfixUnaryExpression(node.operand, flip),
      },
    ];
  }
  return [];
};

export const ALL_MUTATORS: MutatorFn[] = [
  equalityMutator,
  arithmeticMutator,
  logicalMutator,
  relationalMutator,
  stringLiteralMutator,
  booleanLiteralMutator,
  conditionalMutator,
  optionalChainingMutator,
  numericLiteralMutator,
  arrayDeclarationMutator,
  assignmentMutator,
  arrowFunctionMutator,
  methodExpressionMutator,
  objectLiteralMutator,
  regexMutator,
  unaryOperatorMutator,
  updateOperatorMutator,
];
