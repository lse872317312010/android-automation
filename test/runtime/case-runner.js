/* Same assertions in V8 and Rhino. No native privileges. */
function runRuntimeCase(spec) {
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
