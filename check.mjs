import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ignored = new Set(['node_modules','.git','.next','dist','build']);
const inside = (base, target) => target === base || target.startsWith(base + path.sep);
const safeDecode = (text) => { try { return decodeURIComponent(text); } catch { return text; } };

export async function scan(directory) {
  const base = path.resolve(directory);
  if (!(await stat(base)).isDirectory()) throw new Error('Target must be a directory');
  const issues=[];
  const pages=[];
  async function visit(dir) {
    for (const entry of await readdir(dir,{withFileTypes:true})) {
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const location=path.join(dir,entry.name);
      if (entry.isDirectory()) await visit(location);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) pages.push(location);
    }
  }
  await visit(base);
  for (const page of pages) {
    const text=await readFile(page,'utf8');
    const display=path.relative(base,page).replaceAll(path.sep,'/');
    if (!/<title[^>]*>\s*[^<\s][\s\S]*?<\/title>/i.test(text)) issues.push({file:display,type:'missing-title',detail:'Add a useful document title.'});
    if (!/<html\b[^>]*\blang\s*=/i.test(text)) issues.push({file:display,type:'missing-lang',detail:'Set the document language.'});
    if (!/<meta\s+[^>]*name\s*=\s*["']viewport["']/i.test(text)) issues.push({file:display,type:'missing-viewport',detail:'Add a viewport meta tag for mobile layouts.'});
    for (const img of text.matchAll(/<img\b[^>]*>/gi)) if(!/\balt\s*=/.test(img[0])) issues.push({file:display,type:'missing-alt',detail:'An image lacks alt text.'});
    for (const match of text.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gis)) {
      const ref=match[2].trim();
      if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) continue;
      const [relative,fragment='']=ref.split('#',2);
      const clean=safeDecode(relative.split('?')[0]);
      let target=clean?path.resolve(path.dirname(page),clean):page;
      if(!inside(base,target)) {issues.push({file:display,type:'outside-project',detail:ref});continue;}
      let exists=true;
      try {const item=await stat(target);if(item.isDirectory())target=path.join(target,'index.html');await stat(target);}catch{exists=false;}
      if(!exists){issues.push({file:display,type:'missing-local-file',detail:ref});continue;}
      if(fragment && path.extname(target).toLowerCase()==='.html') {
        const html=target===page?text:await readFile(target,'utf8');
        const wanted=safeDecode(fragment);
        const escaped=wanted.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        if(!new RegExp(`\\bid\\s*=\\s*["']${escaped}["']`).test(html)) issues.push({file:display,type:'missing-anchor',detail:ref});
      }
    }
  }
  return {directory:base,filesChecked:pages.length,issues};
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const target=process.argv[2];
  if(!target){console.error('Usage: node check.mjs <website-folder>');process.exitCode=2;}
  else {
    try {
      const result=await scan(target);
      console.log(`Checked ${result.filesChecked} HTML pages; found ${result.issues.length} issue(s).`);
      for(const item of result.issues) console.log(`- ${item.file}: ${item.type} — ${item.detail}`);
      if(result.issues.length) process.exitCode=1;
    } catch(error){console.error(error.message);process.exitCode=2;}
  }
}
