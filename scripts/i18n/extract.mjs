import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
function files(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(`${dir}/${f.name}`):[`${dir}/${f.name}`]); }
const candidates = new Map();
const ignoredProps = new Set(['className','id','href','src','type','name','value','defaultValue','key','data-testid','data-state','role','htmlFor','aria-controls','aria-labelledby','aria-describedby','viewBox','d','fill','stroke','sizes','method','autoComplete','target','rel','inputMode','pattern','action']);
function add(s, file, visible = false) {
  s = s.replace(/\s+/g,' ').trim();
  if (!s || !/[a-zA-ZčćšđžČĆŠĐŽ]/.test(s) || /^(?:\/?api\/|https?:|\.\/|\.\.\/|\/|#|--|[a-z]+:|image\/|application\/)/.test(s)) return;
  if (!visible && !/[\sčćšđžČĆŠĐŽ]/.test(s) && !/^[A-Z]/.test(s)) return;
  if ((!visible && /^[a-z0-9_]+$/.test(s)) || /^data-/.test(s) || /^(?:M[\d.-]|translate\(|rotate\(|var\(|linear-gradient|\(prefers-)/.test(s)) return;
  const list=candidates.get(s)??[]; if(!list.includes(file))list.push(file); candidates.set(s,list);
}
const input = files('app').filter(p=>p.endsWith('.tsx')&&!p.startsWith('app/admin/')&&!p.includes('/lib/i18n/')&&!/market-shell|milk-scene|brand-glyph|brand-illustration/.test(p));
input.push('app/lib/content.ts','app/lib/frontend.ts','app/lib/hero-media.ts','server/product-details.ts','server/settings.ts');
for(const file of input) {
  const sf=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  function walk(n) {
    if(ts.isJsxText(n))add(n.text,file,true);
    if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)) {
      if(ts.isJsxAttribute(n.parent)&&ignoredProps.has(n.parent.name.text))return;
      if(ts.isImportDeclaration(n.parent)||ts.isExportDeclaration(n.parent))return;
      add(n.text,file);
    }
    if(ts.isTemplateExpression(n)) add(n.head.text+n.templateSpans.map((span,i)=>`{${i}}${span.literal.text}`).join(''),file);
    ts.forEachChild(n,walk);
  }
  walk(sf);
}
writeFileSync('/tmp/mleko-i18n-candidates.json',JSON.stringify([...candidates].map(([source,files])=>({source,files})),null,2));
writeFileSync('/tmp/mleko-i18n-strings.txt',[...candidates.keys()].map((x,i)=>`${i}\t${x}`).join('\n'));
console.log(candidates.size+' messages');
