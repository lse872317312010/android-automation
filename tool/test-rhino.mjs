import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lock=JSON.parse(fs.readFileSync(path.join(root,'test/runtime/rhino-lock.json'),'utf8'));
const cache=path.join(root,'.cache','rhino');fs.mkdirSync(cache,{recursive:true});
const jar=path.join(cache,'autojs6-rhino.jar');
const digest=(b,alg='sha256')=>crypto.createHash(alg).update(b).digest('hex');
function checkedJar(){
    if(!fs.existsSync(jar))return false;
    const b=fs.readFileSync(jar);
    return digest(b)===lock.sha256 && digest(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b]),'sha1')===lock.gitBlob;
}
if(!checkedJar()){
    const pending=jar+'.download';
    const fetch=spawnSync('curl',['--fail','--silent','--show-error','--location','--retry','2',
        '--max-time','90','--output',pending,lock.url],{encoding:'utf8',timeout:100000});
    if(fetch.status!==0)throw new Error('Pinned Rhino download failed');
    fs.renameSync(pending,jar);
    if(!checkedJar())throw new Error('Pinned Rhino digest mismatch');
}
const scenarios=JSON.parse(fs.readFileSync(path.join(root,'test/runtime/cases.json'),'utf8'));
const fixture=fs.readFileSync(path.join(root,'test/runtime/host-fixture.js'),'utf8');
const bundle=fs.readFileSync(path.join(root,'dist/AndroidAutomation.js'),'utf8');
const assertion=fs.readFileSync(path.join(root,'test/runtime/case-runner.js'),'utf8');
const results=[];
for(const [index,scenario] of scenarios.entries()){
    const script=path.join(cache,`case-${index}.js`);
    fs.writeFileSync(script,`var __options=${JSON.stringify(scenario.options)};\n${fixture}\n${bundle}\n${assertion}\n`+
        `print(JSON.stringify(runRuntimeCase(${JSON.stringify(scenario)})));\n`);
    const child=spawnSync('java',['-cp',jar,'org.mozilla.javascript.tools.shell.Main','-version',lock.languageVersion,
        '-opt','-1','-f',script],{cwd:root,encoding:'utf8',timeout:15000});
    const passed=child.status===0;
    results.push({name:scenario.name,status:passed?'pass':'fail'});
    console.log(`${passed?'PASS':'FAIL'} Rhino: ${scenario.name}`);
    if(!passed) console.error((child.stderr || child.error?.message || 'Engine exited without success').slice(0,2000));
}
const report={tier:'T0/T1 Rhino on JVM',runtime:lock.runtime,engineSha256:lock.sha256,
    scriptSha256:digest(Buffer.from(bundle)),deviceValidation:'not_established',cases:results};
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
fs.writeFileSync(path.join(root,'test-results/rhino.json'),JSON.stringify(report,null,2)+'\n');
if(results.some(x=>x.status!=='pass'))process.exitCode=1;
