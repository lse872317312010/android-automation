'use strict';
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
for(const scenario of require('./runtime/cases.json'))test('runtime contract: '+scenario.name,()=>{
    const sandbox={__options:scenario.options,__case:scenario};vm.createContext(sandbox);
    for(const file of ['test/runtime/host-fixture.js','dist/AndroidAutomation.js','test/runtime/case-runner.js'])
        vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),sandbox,{filename:file});
    vm.runInContext('runRuntimeCase(__case)',sandbox,{timeout:5000});
});
