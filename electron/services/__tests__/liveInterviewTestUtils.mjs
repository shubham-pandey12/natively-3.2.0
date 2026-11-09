import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const root=process.cwd();
const require=createRequire(path.join(root,'package.json'));
const ts=require('typescript');
export const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');
export function parsed(name) { const source=read(name); return ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,name.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS); }
export function findNode(name,predicate) { let found; const visit=(n)=>{if(!found&&predicate(n))found=n; if(!found)ts.forEachChild(n,visit);}; visit(parsed(name)); if(!found)throw new Error('Missing source node: '+name); return found; }
export function callCallback(name,method,event) { const n=findNode(name,n=>ts.isCallExpression(n)&&n.expression.getText().includes(method)&&(!event||n.arguments[0]?.text===event)); return n.arguments.find(a=>ts.isArrowFunction(a)||ts.isFunctionExpression(a)).getText(); }
export function evaluate(source,globals={}) { const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;return vm.runInNewContext(code,{console:{log(){},warn(){},error(){}},setTimeout,clearTimeout,AbortController,Promise,...globals}); }
export function loadMethods(name,className,predicate,globals={}) {const cls=findNode(name,n=>ts.isClassDeclaration(n)&&n.name?.text===className);const methods=cls.members.filter(n=>predicate(n.name?.getText()??'',n)).map(n=>n.getText()).join('\n');return evaluate('(class {'+methods+'})',globals);}
export function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}
export const tick=()=>new Promise(r=>setImmediate(r));
export { ts };
