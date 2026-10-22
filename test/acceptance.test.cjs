'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {validate, scenarios} = require('../tool/validate-acceptance.cjs');
const binding = {commit:'a'.repeat(40), scriptSha256:'b'.repeat(64)};
function fixture() {
    const reasons = {capture_denied:'CAPTURE_PERMISSION_DENIED', shizuku_denied:'SHIZUKU_NOT_AUTHORIZED',
        foreground_switch:'FOREGROUND_CHANGED', rotation:'ROTATION_CHANGED', stop:'CANCELLED', cold_restart:'PROCESS_INTERRUPTED'};
    return {schema:'android-automation.acceptance.v1', environment:'physical_redmi', synthetic:false,
        ...binding, operatorObserved:true, fixtureUnassisted:true, cases:scenarios.map(scenario=>({
            scenario, result:'pass', observedInputCount:scenario==='fixture'?1:0,
            run:{runId:crypto.randomUUID(), mode:scenario==='starrail_read_only'?'starrail_probe':'fixture',
                status:scenario==='fixture'?'verified':scenario==='starrail_read_only'?'observed':
                    scenario==='stop'?'cancelled':scenario==='cold_restart'?'interrupted':'blocked',
                reason:reasons[scenario]||null, actionCount:scenario==='fixture'?1:0,
                verificationFrames:scenario==='fixture'?2:0,
                deviceValidation:scenario==='fixture'?'fixture_observed_only':
                    scenario==='starrail_read_only'?'read_only_observed_only':'not_established'}
        }))};
}
test('consistent operator assertions are eligible for review, never auto-promoted',()=>{
    assert.deepEqual(validate(fixture(),binding),[]);
});
test('templates, unobserved runs and mismatched artifacts are rejected',()=>{
    for (const mutate of [r=>r.synthetic=true, r=>r.operatorObserved=false, r=>r.fixtureUnassisted=false,
        r=>r.commit='c'.repeat(40), r=>r.scriptSha256='d'.repeat(64), r=>r.environment='node_vm']) {
        const r=fixture();mutate(r);assert.ok(validate(r,binding).length);
    }
    assert.ok(validate(fixture()).includes('EXPECTED_BINDING_REQUIRED'));
});
test('missing, duplicate or reused cases and reports cannot satisfy acceptance',()=>{
    for(const mutate of [r=>r.cases.pop(), r=>r.cases[1]=r.cases[0],
        r=>r.cases[1].run.runId=r.cases[0].run.runId, r=>r.cases[0].result='pending']) {
        const r=fixture();mutate(r);assert.ok(validate(r,binding).length);
    }
});
test('read-only results and action intent cannot satisfy completed fixture',()=>{
    for(const mutate of [r=>r.cases[0].run.status='observed',r=>r.cases[0].run.verificationFrames=1,
        r=>r.cases[0].run.deviceValidation='device_verified', r=>r.cases[0].observedInputCount=0,
        r=>r.cases[7].run.actionCount=1, r=>r.cases[1].run.actionCount=1,
        r=>r.cases[3].observedInputCount=1, r=>r.cases[0].run.actionCount=2]) {
        const r=fixture();mutate(r);assert.ok(validate(r,binding).length);
    }
});
test('privacy allowlist rejects raw screenshots, OCR text and extra identifiers at every level',()=>{
    for(const mutate of [r=>r.serial='secret', r=>r.cases[0].screenshot='secret',
        r=>r.cases[0].run.ocrText='secret']) {
        const r=fixture();mutate(r);assert.ok(validate(r,binding).some(x=>x.endsWith('_FIELDS')));
    }
});
test('malformed records produce validation codes without leaking values',()=>{
    for(const value of [null,[],{}, {cases:'private'}, {...fixture(),cases:[null]}])
        assert.ok(validate(value,binding).length);
});
test('checked-in pending template is never real acceptance',()=>{
    const template=require('../evidence/redmi-acceptance.template.json');
    assert.ok(validate(template,binding).includes('SYNTHETIC_OR_TEMPLATE'));
});
