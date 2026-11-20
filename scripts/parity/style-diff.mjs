import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import ts from 'typescript';

const UNKNOWN = Symbol('unresolved style expression');

function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : undefined;
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

export function extractStyles(source, filename, marker) {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const bindings = new Map();
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) bindings.set(decl.name.text, decl.initializer);
    }
  }

  const matches = [];
  walk(file, (node) => {
    if (ts.isObjectLiteralExpression(node) && node.properties.some(
      (entry) => entry.name && propertyName(entry.name) === marker,
    )) matches.push(node);
  });
  if (matches.length !== 1) throw new Error(filename + ': expected exactly one object containing ' + marker);

  // Interpret data expressions only. No function calls or property getters
  // from the bundle are executed, and unknown bindings stay visibly unresolved.
  const evaluating = new Set();
  function read(node) {
    if (!node || evaluating.has(node)) return UNKNOWN;
    evaluating.add(node);
    try {
      return evaluate(node);
    } finally {
      evaluating.delete(node);
    }
  }

  function evaluate(node) {
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isIdentifier(node)) return read(bindings.get(node.text));
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
      return read(node.expression);
    }
    if (ts.isPrefixUnaryExpression(node)) {
      const operand = read(node.operand);
      if (operand === UNKNOWN) return UNKNOWN;
      if (node.operator === ts.SyntaxKind.ExclamationToken) return !operand;
      if (node.operator === ts.SyntaxKind.MinusToken && typeof operand === 'number') return -operand;
    }
    if (ts.isBinaryExpression(node)) {
      const left = read(node.left);
      const right = read(node.right);
      if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        if (typeof left === 'number' && typeof right === 'number') return left + right;
        if ([left, right].every((v) => typeof v === 'string' || typeof v === 'number')) return String(left) + right;
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      const object = read(node.expression);
      if (isObject(object) && Object.hasOwn(object, node.name.text)) return object[node.name.text];
    }
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      for (const { expression, literal } of node.templateSpans) {
        const part = read(expression);
        if (typeof part !== 'string' && typeof part !== 'number') return UNKNOWN;
        value += String(part) + literal.text;
      }
      return value;
    }
    if (ts.isObjectLiteralExpression(node)) {
      const style = Object.create(null);
      for (const entry of node.properties) {
        if (ts.isSpreadAssignment(entry)) {
          const spread = read(entry.expression);
          if (!isObject(spread)) return UNKNOWN;
          Object.assign(style, spread);
        } else if (ts.isShorthandPropertyAssignment(entry)) {
          style[entry.name.text] = read(entry.name);
        } else if (entry.name) {
          const key = propertyName(entry.name);
          if (key === undefined) return UNKNOWN;
          style[key] = ts.isPropertyAssignment(entry) ? read(entry.initializer) : UNKNOWN;
        }
      }
      return style;
    }
    return UNKNOWN;
  }

  const result = read(matches[0]);
  if (!isObject(result)) throw new Error(filename + ': could not resolve style table');
  return result;
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

export function styleDifferences(reference, ours, prefix = '') {
  const names = [...new Set([...Object.keys(reference), ...Object.keys(ours)])].sort();
  return names.flatMap((name) => {
    const key = prefix ? prefix + '.' + name : name;
    if (!Object.hasOwn(reference, name)) return [{ key, status: 'only-in-ours' }];
    if (!Object.hasOwn(ours, name)) return [{ key, status: 'only-in-reference' }];
    const a = reference[name];
    const b = ours[name];
    if (a === UNKNOWN || b === UNKNOWN) return [{ key, status: 'unresolved' }];
    if (isObject(a) && isObject(b)) return styleDifferences(a, b, key);
    return Object.is(a, b) ? [] : [{ key, status: 'changed' }];
  });
}

function main() {
  const { values } = parseArgs({ options: {
    reference: { type: 'string' },
    ours: { type: 'string', default: 'premium/src/ModesSettings.tsx' },
    marker: { type: 'string', default: 'uploadBtn' },
  } });
  if (!values.reference) throw new Error('Pass --reference <renderer bundle>');
  const [reference, ours] = [values.reference, values.ours].map((file) =>
    extractStyles(readFileSync(file, 'utf8'), file, values.marker));
  const diffs = styleDifferences(reference, ours);
  const totals = { changed: 0, 'only-in-reference': 0, 'only-in-ours': 0, unresolved: 0 };
  for (const { key, status } of diffs) {
    totals[status]++;
    console.log(status + '\t' + key);
  }
  console.log('Summary: ' + Object.entries(totals).map(([key, count]) => key + '=' + count).join(' '));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
