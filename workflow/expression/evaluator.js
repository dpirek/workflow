const TOKEN =
  /\s*(?:(\d+(?:\.\d+)?)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)|(===|!==|==|!=|>=|<=|&&|\|\||[()!<>+\-*/%]))/y;

function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    TOKEN.lastIndex = index;
    const match = TOKEN.exec(source);
    if (!match) throw new Error(`Invalid expression near: ${source.slice(index, index + 24)}`);
    const [raw, number, string, identifier, operator] = match;
    index += raw.length;
    if (number !== undefined) tokens.push({ type: 'literal', value: Number(number) });
    else if (string !== undefined) {
      const normalized = string.startsWith("'")
        ? `"${string.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`
        : string;
      tokens.push({ type: 'literal', value: JSON.parse(normalized) });
    } else if (identifier !== undefined) {
      const literals = { true: true, false: false, null: null };
      tokens.push(
        Object.hasOwn(literals, identifier)
          ? { type: 'literal', value: literals[identifier] }
          : { type: 'identifier', value: identifier },
      );
    } else tokens.push({ type: 'operator', value: operator });
  }
  tokens.push({ type: 'eof' });
  return tokens;
}

const PRECEDENCE = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '===': 3,
  '!==': 3,
  '>': 4,
  '>=': 4,
  '<': 4,
  '<=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

function parse(source) {
  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const consume = () => tokens[position++];

  function primary() {
    const token = consume();
    if (token.type === 'literal' || token.type === 'identifier') return token;
    if (token.value === '(') {
      const node = binary(1);
      if (consume().value !== ')') throw new Error('Expected closing parenthesis');
      return node;
    }
    if (token.value === '!' || token.value === '-') return { type: 'unary', operator: token.value, value: primary() };
    throw new Error('Expected a value');
  }

  function binary(minimum) {
    let left = primary();
    while (peek().type === 'operator' && (PRECEDENCE[peek().value] || 0) >= minimum) {
      const operator = consume().value;
      const precedence = PRECEDENCE[operator];
      const right = binary(precedence + 1);
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  const tree = binary(1);
  if (peek().type !== 'eof') throw new Error(`Unexpected token: ${peek().value}`);
  return tree;
}

function resolveIdentifier(path, variables) {
  return path.split('.').reduce((value, key) => {
    if (value === null || value === undefined || typeof value !== 'object') return undefined;
    return Object.hasOwn(value, key) ? value[key] : undefined;
  }, variables);
}

function run(node, variables) {
  if (node.type === 'literal') return node.value;
  if (node.type === 'identifier') return resolveIdentifier(node.value, variables);
  if (node.type === 'unary') {
    const value = run(node.value, variables);
    return node.operator === '!' ? !value : -Number(value);
  }
  const left = run(node.left, variables);
  if (node.operator === '&&') return left && run(node.right, variables);
  if (node.operator === '||') return left || run(node.right, variables);
  const right = run(node.right, variables);
  switch (node.operator) {
    case '==':
      return left == right; // Intentional workflow-friendly coercion.
    case '!=':
      return left != right;
    case '===':
      return left === right;
    case '!==':
      return left !== right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '+':
      return left + right;
    case '-':
      return Number(left) - Number(right);
    case '*':
      return Number(left) * Number(right);
    case '/':
      return Number(left) / Number(right);
    case '%':
      return Number(left) % Number(right);
    default:
      throw new Error(`Unsupported operator: ${node.operator}`);
  }
}

export function validateExpression(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Expression must be a non-empty string');
  parse(source);
}

export function evaluateExpression(source, variables) {
  return Boolean(run(parse(source), variables));
}
