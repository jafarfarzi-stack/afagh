import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
// Structural regression guard, not a security proof or a SQL parser.
const problems = [];
function scan(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { scan(p); continue; }
    if (!/\.tsx?$/.test(p) || p.replaceAll('\\', '/') === 'src/lib/audit-writer.ts') continue;
    const source = ts.createSourceFile(p, readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true);
    const names = new Set(['audit_logs']);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node)) continue;
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) {
        if ((item.propertyName ?? item.name).text === 'audit_logs') names.add(item.name.text);
      }
    }
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'insert') {
        const arg = node.arguments[0];
        if (arg && ((ts.isIdentifier(arg) && names.has(arg.text)) || (ts.isPropertyAccessExpression(arg) && arg.name.text === 'audit_logs'))) problems.push(p);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
scan('src');
if (problems.length) {
  console.error('Direct audit writes outside shared writer:', problems);
  process.exit(1);
}
console.log('PASS: no direct Drizzle audit insert outside shared writer');
