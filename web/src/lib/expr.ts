// Arithmetic expressions for lesson graphs ("2*m + b", "sqrt(a^2 + b^2)").
// A model writes them, so they are parsed here and never passed to eval.
// Pure and shared: the AI module and the backend validate with it, the
// browser draws with it.
//
// Grammar: numbers, names, + - * / ^, unary minus, parentheses, the functions
// and constants below, and implicit multiplication ("2x", "mx", "3(x + 1)").

export class ExprError extends Error {}

export const EXPR_FUNCTIONS: Record<string, { arity: number; fn: (...args: number[]) => number }> = {
  sqrt: { arity: 1, fn: Math.sqrt },
  abs: { arity: 1, fn: Math.abs },
  sin: { arity: 1, fn: Math.sin },
  cos: { arity: 1, fn: Math.cos },
  tan: { arity: 1, fn: Math.tan },
  ln: { arity: 1, fn: Math.log },
  log: { arity: 1, fn: Math.log10 },
  exp: { arity: 1, fn: Math.exp },
  floor: { arity: 1, fn: Math.floor },
  round: { arity: 1, fn: Math.round },
  min: { arity: 2, fn: Math.min },
  max: { arity: 2, fn: Math.max },
};

export const EXPR_CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const isFunction = (name: string) => Object.hasOwn(EXPR_FUNCTIONS, name);
const isConstant = (name: string) => Object.hasOwn(EXPR_CONSTANTS, name);

/** Names a variable may not take: they already mean something. */
export function isReservedName(name: string): boolean {
  return isFunction(name) || isConstant(name);
}

export type Scope = Record<string, number>;
export type Compiled = (scope: Scope) => number;

type Token = { type: "num"; value: number } | { type: "name"; value: string } | { type: "op"; value: string };

const MAX_LENGTH = 200;
const MAX_DEPTH = 40;

function tokenize(source: string): Token[] {
  // Typographic forms a model may copy from a textbook.
  const text = source
    .replace(/[−–]/g, "-")
    .replace(/[×·⋅]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3");
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const match = /^(\d+\.?\d*|\.\d+)/.exec(text.slice(i));
      if (!match) throw new ExprError(`bad number in "${source}"`);
      tokens.push({ type: "num", value: Number(match[0]) });
      i += match[0].length;
    } else if (/[a-zA-Z]/.test(ch)) {
      const match = /^[a-zA-Z][a-zA-Z0-9]*/.exec(text.slice(i))!;
      tokens.push({ type: "name", value: match[0] });
      i += match[0].length;
    } else if ("+-*/^(),".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
    } else {
      throw new ExprError(`unexpected "${ch}" in "${source}"`);
    }
  }
  return tokens;
}

/** Splits a run of letters like "mx" into known names, longest first. */
function splitNames(run: string, known: (name: string) => boolean): string[] | null {
  if (!run) return [];
  for (let length = run.length; length >= 1; length--) {
    const head = run.slice(0, length);
    if (!known(head)) continue;
    const rest = splitNames(run.slice(length), known);
    if (rest) return [head, ...rest];
  }
  return null;
}

/**
 * Parses an expression over the given variables. Throws ExprError when it
 * does not parse or uses a name that is neither a variable, a constant nor a
 * function.
 */
export function compile(source: string, variables: readonly string[]): Compiled {
  if (source.length > MAX_LENGTH) throw new ExprError("expression is too long");
  const tokens = tokenize(source);
  if (!tokens.length) throw new ExprError("expression is empty");
  const vars = new Set(variables);
  const isValue = (name: string) => vars.has(name) || isConstant(name);
  let at = 0;
  let depth = 0;

  const peek = () => tokens[at];
  const isOp = (value: string) => peek()?.type === "op" && peek().value === value;
  const expectOp = (value: string) => {
    if (!isOp(value)) throw new ExprError(`expected "${value}" in "${source}"`);
    at++;
  };
  const value = (name: string): Compiled =>
    vars.has(name) ? (scope) => scope[name] : () => EXPR_CONSTANTS[name];

  function expression(): Compiled {
    if (++depth > MAX_DEPTH) throw new ExprError("expression is nested too deeply");
    let left = term();
    while (isOp("+") || isOp("-")) {
      const minus = tokens[at++].value === "-";
      const a = left;
      const b = term();
      left = minus ? (s) => a(s) - b(s) : (s) => a(s) + b(s);
    }
    depth--;
    return left;
  }

  function term(): Compiled {
    let left = unary();
    for (;;) {
      const a = left;
      if (isOp("*")) {
        at++;
        const b = unary();
        left = (s) => a(s) * b(s);
      } else if (isOp("/")) {
        at++;
        const b = unary();
        left = (s) => a(s) / b(s);
      } else if (peek() && (peek().type !== "op" || isOp("("))) {
        // Implicit multiplication: "2x", "3(x + 1)".
        const b = power();
        left = (s) => a(s) * b(s);
      } else {
        return left;
      }
    }
  }

  function unary(): Compiled {
    if (isOp("-")) {
      at++;
      const a = unary();
      return (s) => -a(s);
    }
    if (isOp("+")) {
      at++;
      return unary();
    }
    return power();
  }

  function power(): Compiled {
    const base = primary();
    if (!isOp("^")) return base;
    at++;
    const exponent = unary();
    return (s) => Math.pow(base(s), exponent(s));
  }

  function primary(): Compiled {
    const token = tokens[at++];
    if (!token) throw new ExprError(`"${source}" ends too early`);
    if (token.type === "num") return () => token.value;
    if (token.type === "op") {
      if (token.value !== "(") throw new ExprError(`unexpected "${token.value}" in "${source}"`);
      const inner = expression();
      expectOp(")");
      return inner;
    }
    const name = token.value;
    const lower = name.toLowerCase();
    if (isFunction(lower) && isOp("(") && !vars.has(name)) {
      const { arity, fn } = EXPR_FUNCTIONS[lower];
      at++;
      const args: Compiled[] = [expression()];
      while (isOp(",")) {
        at++;
        args.push(expression());
      }
      expectOp(")");
      if (args.length !== arity) throw new ExprError(`${lower}() takes ${arity} value${arity === 1 ? "" : "s"}`);
      return (s) => fn(...args.map((arg) => arg(s)));
    }
    if (isValue(name)) return value(name);
    const parts = splitNames(name, isValue);
    if (!parts) throw new ExprError(`unknown name "${name}" in "${source}"`);
    const factors = parts.map(value);
    return (s) => factors.reduce((product, factor) => product * factor(s), 1);
  }

  const root = expression();
  if (at < tokens.length) throw new ExprError(`unexpected "${String(tokens[at].value)}" in "${source}"`);
  return root;
}

/** compile() that returns null instead of throwing. */
export function tryCompile(source: string, variables: readonly string[]): Compiled | null {
  try {
    return compile(source, variables);
  } catch {
    return null;
  }
}
