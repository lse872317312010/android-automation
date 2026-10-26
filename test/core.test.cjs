const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js');
function frame(text, extra = {}) {
    return {width:1080, height:2400, displayWidth:1080, displayHeight:2400,
        rotation:0, capturedAt:0, items:[{text, confidence:0.95,
            bounds:{left:100, top:200, right:400, bottom:300}}], ...extra};
}
function setup(frames) {
    let time=0, taps=0, index=0, cancelled=false, foreground='fixture';
    const stages=[];
    const io={now:()=>time, sleep:ms=>{time+=ms;}, cancelled:()=>cancelled,
        foreground:()=>foreground, checkGeometry:()=>{}, stage:s=>stages.push(s),
        tap:(x,y)=>{assert.equal(x,250);assert.equal(y,250);taps++;},
        observe:()=>{const f=frames[Math.min(index++,frames.length-1)]; return {...f, capturedAt:time};}};
    return {io, stages, taps:()=>taps, cancel:()=>{cancelled=true;},
        foreground:p=>{foreground=p;}, spec:{packageName:'fixture', target:'TEST 123456',
            expected:['PASS 123456'], minExpected:1, confidence:0.65,timeoutMs:15000}};
}
const before=()=>frame('TEST 123456'), after=()=>frame('PASS 123456');
test('report persistence cannot make the second OCR frame stale before input',()=>{
    const t=setup([before()]);
    t.io.stage=()=>t.io.sleep(2600);
    assert.throws(()=>core.run(t.io,t.spec),/STALE_FRAME/);
    assert.equal(t.taps(),0);
});
test('verified only after one tap and two consecutive expected frames',()=>{
    const t=setup([before(),before(),after(),frame('loading'),after(),after()]);
    assert.equal(core.run(t.io,t.spec).status,'verified');assert.equal(t.taps(),1);
    assert.deepEqual(t.stages,['action_requested','verifying','verified']);
});
test('never taps an ambiguous target',()=>{
    const f=before();f.items.push(f.items[0]);const t=setup([f]);
    assert.throws(()=>core.run(t.io,t.spec),/AMBIGUOUS_TARGET/);assert.equal(t.taps(),0);
});
test('frame geometry changes before input are classified as rotation',()=>{
    const changedFrames=[
        frame('TEST 123456',{width:1200,displayWidth:1200}),
        frame('TEST 123456',{height:2000,displayHeight:2000}),
        frame('TEST 123456',{rotation:1})
    ];
    for(const changed of changedFrames){
        const t=setup([before(),changed]);
        assert.throws(()=>core.run(t.io,t.spec),/ROTATION_CHANGED/);
        assert.equal(t.taps(),0);
    }
});
test('target coordinate drift within stable geometry remains unstable',()=>{
    const movedX=before();
    movedX.items[0].bounds={left:120,top:200,right:420,bottom:300};
    const movedY=before();
    movedY.items[0].bounds={left:100,top:220,right:400,bottom:320};
    for(const moved of [movedX,movedY]){
        const t=setup([before(),moved]);
        assert.throws(()=>core.run(t.io,t.spec),/UNSTABLE_TARGET/);
        assert.equal(t.taps(),0);
    }
});
test('rotation test wait creates a zero-input geometry check window',()=>{
    const t=setup([before(),frame('TEST 123456',{width:2400,height:1080,
        displayWidth:2400,displayHeight:1080,rotation:1})]);
    t.spec.confirmationDelayMs=8000;
    assert.throws(()=>core.run(t.io,t.spec),/ROTATION_CHANGED/);
    assert.equal(t.io.now(),8000);
    assert.equal(t.taps(),0);
});
for (const [name,frames,reason] of [
    ['low confidence',[frame('TEST 123456',{items:[{text:'TEST 123456',confidence:0.2,bounds:{}}]})],'TARGET_NOT_FOUND'],
    ['already completed',[after()],'ALREADY_AT_RESULT'],
    ['cropped capture',[frame('TEST 123456',{displayWidth:1200})],'CAPTURE_GEOMETRY_MISMATCH'],
    ['rotation before action',[before(),frame('TEST 123456',{rotation:1})],'ROTATION_CHANGED'],
    ['no result transition',[before()],'POSTCONDITION_NOT_MET'],
    ['different run nonce',[before(),before(),frame('PASS 999999')],'POSTCONDITION_NOT_MET'],
    ['rotation after action',[before(),before(),frame('PASS 123456',{rotation:1})],'ROTATION_CHANGED'],
]) test(name,()=>{const t=setup(frames);assert.throws(()=>core.run(t.io,t.spec),new RegExp(reason));
    assert.equal(t.taps(),/POSTCONDITION|after action/.test(reason+' '+name)?1:0);});
test('foreground change blocks injection',()=>{
    const t=setup([before()]);t.io.sleep=()=>t.foreground('other');
    assert.throws(()=>core.run(t.io,t.spec),/FOREGROUND_CHANGED/);assert.equal(t.taps(),0);
});
test('cancel during OCR blocks injection',()=>{
    const t=setup([before()]);const observe=t.io.observe;t.io.observe=()=>{t.cancel();return observe();};
    assert.throws(()=>core.run(t.io,t.spec),/CANCELLED/);assert.equal(t.taps(),0);
});
test('stale OCR output blocks action',()=>{
    const t=setup([before()]);t.io.observe=()=>({...before(),capturedAt:-10000});
    assert.throws(()=>core.run(t.io,t.spec),/STALE_FRAME/);assert.equal(t.taps(),0);
});
test('injection failure is not retried',()=>{
    const t=setup([before()]);let attempts=0;t.io.tap=()=>{attempts++;throw new Error('INJECT_FAILED');};
    assert.throws(()=>core.run(t.io,t.spec),/INJECT_FAILED/);assert.equal(attempts,1);
});
test('timeout after slow capture blocks action',()=>{
    const t=setup([before()]);const observe=t.io.observe;
    t.io.observe=()=>{t.io.sleep(16000);return observe();};
    assert.throws(()=>core.run(t.io,t.spec),/TIMEOUT/);assert.equal(t.taps(),0);
});
test('out of screen bounds blocks action',()=>{
    const f=before();f.items[0].bounds.right=9999;const t=setup([f]);
    assert.throws(()=>core.run(t.io,t.spec),/INVALID_BOUNDS/);assert.equal(t.taps(),0);
});

test('read-only probe collects two stable OCR summaries and never touches input',()=>{
    const t=setup([before(),before()]);
    // If this function ever uses io.tap, fail the test immediately.
    t.io.tap=()=>{throw new Error('READ_ONLY_TAPPED');};
    const result=core.probe(t.io,t.spec);
    assert.equal(result.status,'observed');
    assert.deepEqual(result.summary.ocrCounts,[1,1]);
    assert.deepEqual(result.summary.targetCounts,[1,1]);
    assert.equal(result.summary.targetStableUnique,true);
    assert.equal(result.summary.observedFrames,2);
    assert.equal(t.taps(),0);
    assert.deepEqual(t.stages,[]);
});
test('read-only probe succeeds without game menu text and never taps',()=>{
    const t=setup([frame('loading'),frame('world')]);
    const result=core.probe(t.io,t.spec);
    assert.equal(result.status,'observed');
    assert.deepEqual(result.summary.targetCounts,[0,0]);
    assert.equal(result.summary.targetStableUnique,false);
    assert.equal(t.taps(),0);
});
test('read-only probe rejects a foreground switch between screenshots',()=>{
    const t=setup([before(),before()]);
    t.io.sleep=()=>t.foreground('unexpected.package');
    assert.throws(()=>core.probe(t.io,t.spec),/FOREGROUND_CHANGED/);
    assert.equal(t.taps(),0);
});
test('read-only rotation probe uses the requested delay and never taps',()=>{
    const t=setup([before(),frame('TEST 123456',{rotation:1})]);
    t.spec.confirmationDelayMs=8000;
    t.io.tap=()=>{throw new Error('ROTATION_PROBE_TAPPED');};
    assert.throws(()=>core.probe(t.io,t.spec),/ROTATION_CHANGED/);
    assert.equal(t.io.now(),8000);
    assert.equal(t.taps(),0);
});
test('read-only probe rejects rotation and crop',()=>{
    const t=setup([before(),frame('TEST 123456',{rotation:1})]);
    assert.throws(()=>core.probe(t.io,t.spec),/ROTATION_CHANGED/);
    assert.equal(t.taps(),0);
    const cropped=setup([frame('TEST 123456',{displayWidth:1200})]);
    assert.throws(()=>core.probe(cropped.io,cropped.spec),/CAPTURE_GEOMETRY_MISMATCH/);
    assert.equal(cropped.taps(),0);
});
test('read-only probe respects cancellation and total deadline',()=>{
    const t=setup([before(),before()]);
    t.io.sleep=()=>t.cancel();
    assert.throws(()=>core.probe(t.io,t.spec),/CANCELLED/);
    assert.equal(t.taps(),0);
    const late=setup([before(),before()]);
    late.io.sleep=ms=>{late.io.now=()=>20000;};
    assert.throws(()=>core.probe(late.io,late.spec),/TIMEOUT/);
    assert.equal(late.taps(),0);
});

test('extracts installed APK version without retaining a package dump',()=>{
    const raw=['Packages:', '  Package [com.miHoYo.hkrpg]', '    versionCode=5012301 minSdk=23 targetSdk=35',
        '    versionName=3.9.0'].join('\n');
    assert.deepEqual(core.parsePackageDump(raw),{versionCode:'5012301',versionName:'3.9.0'});
    assert.equal(core.parsePackageDump('versionName=3.9.0'),null);
    assert.equal(core.parsePackageDump('versionCode=bad'),null);
});
test('client version drift is isolated from locale/package and missing baselines',()=>{
    const pkg='com.miHoYo.hkrpg';
    const current={versionCode:'5012301',versionName:'3.9.0'};
    const old={packageName:pkg,versionCode:'5012300'};
    assert.equal(core.versionStatus(current,old,pkg),'changed');
    assert.equal(core.versionStatus(current,{packageName:pkg,versionCode:'5012301'},pkg),'unchanged');
    assert.equal(core.versionStatus(current,{packageName:'com.other',versionCode:'5012301'},pkg),'first_seen');
    assert.equal(core.versionStatus(current,null,pkg),'first_seen');
    assert.equal(core.versionStatus(null,old,pkg),'unknown');
});


test('pre-tap state persistence cannot bypass foreground, cancel or timeout guards', () => {
    for (const scenario of ['foreground', 'cancel', 'timeout']) {
        const t = setup([before(), before(), after(), after()]);
        const original = t.io.stage;
        t.io.stage = stage => {
            original(stage);
            if (stage !== 'action_requested') return;
            if (scenario === 'foreground') t.foreground('other.package');
            if (scenario === 'cancel') t.cancel();
            if (scenario === 'timeout') t.io.sleep(16000);
        };
        const reason = {foreground:'FOREGROUND_CHANGED', cancel:'CANCELLED', timeout:'TIMEOUT'}[scenario];
        assert.throws(() => core.run(t.io, t.spec), new RegExp(reason), scenario);
        assert.equal(t.taps(), 0, 'no privileged input after ' + scenario);
        assert.deepEqual(t.stages, ['action_requested']);
    }
});

test('changed geometry on final pre-tap recheck never causes input', () => {
    const t = setup([before(), before()]);
    let checks = 0;
    t.io.checkGeometry = () => {
        if (++checks === 2) throw new Error('ROTATION_CHANGED');
    };
    assert.throws(() => core.run(t.io, t.spec), /ROTATION_CHANGED/);
    assert.equal(t.taps(), 0);
    assert.equal(checks, 2);
});

test('untrusted OCR capture timestamp cannot be missing, malformed or in future', () => {
    const bad = [undefined, '400', NaN, 30000];
    for (const value of bad) {
        const t = setup([before(), before()]);
        const original = t.io.observe;
        let observed = 0;
        t.io.observe = () => {
            const frame = original();
            if (++observed === 2) frame.capturedAt = value;
            return frame;
        };
        assert.throws(() => core.run(t.io, t.spec), /STALE_FRAME/);
        assert.equal(t.taps(), 0, 'no input with capture timestamp ' + String(value));
    }
});
