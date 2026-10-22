/* Targeted regression sensitivity, not an exhaustive mutation score. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mutations=[
    {id:'raw-error-export',file:'src/android.js',from:"allowed.indexOf(message) >= 0 ? message : 'RUNTIME_ERROR'",to:'message'},
    {id:'delete-baseline-before-replace',file:'src/android.js',from:'if (!new java.io.File(tmp).renameTo(dest))',
        to:'dest.delete();\n    if (!new java.io.File(tmp).renameTo(dest))'},
    {id:'owned-image-leak',file:'src/android.js',from:'finally { img.recycle(); }',to:'finally { /* deliberately leaked */ }'},
    {id:'recycle-cached-image',file:'src/android.js',from:'images.copy(images.captureScreen())',to:'images.captureScreen()'},
    {id:'no-version-input-gate',file:'src/android.js',from:"mode === 'starrail' && clientStatus !== 'unchanged'",to:'false'},
    {id:'readonly-can-execute',file:'src/android.js',from:"mode === 'starrail_probe' ? VisualLoop.probe(io, spec) : VisualLoop.run(io, spec)",to:'VisualLoop.run(io, spec)'},
    {id:'one-postcondition-frame',file:'src/core.js',from:'if (consecutive >= 2)',to:'if (consecutive >= 1)'},
    {id:'duplicate-input',file:'src/core.js',from:'io.tap(q.x, q.y);',to:'io.tap(q.x, q.y); io.tap(q.x, q.y);'},
    {id:'skip-final-stage-freshness',file:'src/core.js',from:'fresh(b);\n        io.tap',to:'/* stale frame accepted */\n        io.tap'},
    {id:'skip-final-adapter-focus',file:'src/android.js',
        from:"if (String(shizuku.currentPackage()) !== pkg) throw new Error('FOREGROUND_CHANGED');\n                    var finalGeometry",
        to:'/* focus guard removed */\n                    var finalGeometry'}
];
const cache=path.join(root,'.cache','mutation');fs.mkdirSync(cache,{recursive:true});
const tests=fs.readdirSync(path.join(root,'test')).filter(x=>x.endsWith('.test.cjs')).map(x=>'test/'+x);
const results=[];
for(const mutation of mutations){
    const dir=path.join(cache,mutation.id);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir);
    for(const name of ['src','test','tool','evidence','build.mjs'])
        fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
    const target=path.join(dir,mutation.file),source=fs.readFileSync(target,'utf8');
    if(source.split(mutation.from).length!==2)throw new Error('Mutation anchor must be unique: '+mutation.id);
    fs.writeFileSync(target,source.replace(mutation.from,mutation.to));
    for(const file of ['src/core.js','src/android.js']){
        const syntax=spawnSync(process.execPath,['--check',file],{cwd:dir,encoding:'utf8',timeout:5000});
        if(syntax.status!==0)throw new Error('Syntax-invalid mutation does not count: '+mutation.id);
    }
    const build=spawnSync(process.execPath,['build.mjs'],{cwd:dir,encoding:'utf8',timeout:5000});
    if(build.status!==0)throw new Error('Mutant bundle failed to build: '+mutation.id);
    const run=spawnSync(process.execPath,['--test','--test-reporter=tap',...tests],
        {cwd:dir,encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024});
    // Timeouts, startup failures or absent tests do not prove regression detection.
    const detected=run.status===1 && /^not ok \d+ - /m.test(run.stdout || '') &&
        !/MODULE_NOT_FOUND|SyntaxError:|ENOENT/.test((run.stdout || '')+(run.stderr || ''));
    const status=detected?'detected':run.status===0?'survived':'harness_error';
    results.push({id:mutation.id,status});console.log(status.toUpperCase()+': '+mutation.id);
}
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
fs.writeFileSync(path.join(root,'test-results/mutations.json'),JSON.stringify({
    scope:'10 targeted regressions only; not an exhaustive mutation score',cases:results},null,2)+'\n');
if(results.some(x=>x.status!=='detected'))process.exitCode=1;
