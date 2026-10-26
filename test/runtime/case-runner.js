/* Same assertions in V8 and Rhino. No native privileges. */
function runRuntimeCase(spec) {
    if (spec.kind === 'skill-contract') {
        var manifest = {
            $comment: 'Runtime contract fixture only; not executable.',
            schema: 'android-automation.skill.v0.draft',
            skill: {id:'fixture.safe_test',version:'0.0.0-draft',gameId:'fixture-game',
                description:'Inert schema fixture',status:'draft',executionEnabled:false},
            compatibility: {packages:['com.example.fixture'],locale:'en-US',
                apkVersionCode:{min:null,max:null},uiSignature:{profile:null,requiredAnchors:[]},
                engine:{id:'maafw',minVersion:null},
                requiredCapabilities:['capture.fullscreen','recognize.ocr','act.tap','verify.semantic']},
            execution:{inputBudget:{maxActions:0,maxRetries:0,timeoutMs:15000},
                workflowPath:null,unknownState:'block',onVersionDrift:'quarantine'},
            verification:{entryCondition:null,successCondition:null,consecutiveObservations:2,
                verificationSource:'deterministic',falseCompletionPolicy:'fail_closed'},
            promotion:{offlineRegression:'required',androidDeviceValidation:'required',review:'required',
                verifiedOnDevice:false},
            rollback:{lastKnownGoodVersion:null},
            provenance:{sourceCommit:null,assetSha256:null,signature:null,signer:null}
        };
        var parsed = SkillContract.parseDraft(JSON.stringify(manifest));
        if (!parsed.valid || Object.prototype.hasOwnProperty.call(parsed, 'manifest'))
            throw new Error(spec.name + ': draft parse contract failed');
        manifest.skill.executionEnabled = true;
        var active = SkillContract.parseDraft(JSON.stringify(manifest));
        if (active.valid || active.errors.indexOf('EXECUTION_DISABLED') < 0)
            throw new Error(spec.name + ': activation was accepted');
        manifest.skill.executionEnabled = false;
        manifest.compatibility.requiredCapabilities.push('act.shell');
        var unknown = SkillContract.parseDraft(JSON.stringify(manifest));
        if (unknown.valid || unknown.errors.indexOf('CAPABILITIES') < 0)
            throw new Error(spec.name + ': unknown capability was accepted');
        return {name:spec.name,status:'pass',taps:0};
    }
    var h=__host;
    if(spec.press!==null)h.press(spec.press || 'selftest');
    if(spec.stopBeforeFlush)h.press('stop');
    if(spec.repeatStart)h.press(spec.press || 'selftest');
    h.flush();h.press('copy');
    var report=h.clips.length?JSON.parse(h.clips[h.clips.length-1]):h.report();
    function equal(a,b,field){if(a!==b)throw new Error(spec.name+': '+field+' expected '+b+' got '+a);}
    equal(report.status,spec.status,'status');
    if(spec.reason!==undefined)equal(report.reason,spec.reason,'reason');
    equal(h.state.tapCommands,spec.taps || 0,'delivered input');
    if(spec.actionCount!==undefined)equal(report.actionCount,spec.actionCount,'actionCount');
    equal(h.state.originalRecycled,0,'cached image recycled');
    equal(h.state.recycled,h.state.copies,'owned image leak');
    if(spec.captureStops!==undefined)equal(h.state.captureStops,spec.captureStops,'capture cleanup');
    if(spec.baselinePreserved)equal(h.stored('/mock/starrail-client-version.json'),
        spec.options.initialStore['/mock/starrail-client-version.json'],'baseline preserved');
    if(spec.reason==='RUNTIME_ERROR' && JSON.stringify(report).indexOf('PRIVATE_')>=0)
        throw new Error('raw error escaped diagnostics');
    if(typeof __jvm!=='undefined' && __jvm && (report.status==='verified' || report.status==='observed'))
        equal(h.state.javaValues>0,true,'native Java values exercised');
    return {name:spec.name,status:'pass',taps:h.state.tapCommands};
}
