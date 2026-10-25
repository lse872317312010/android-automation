'use strict';
// Mocked AutoJs6 host contract. No hardware access, shell privileges, or network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fakeHost(options = {}) {
    const sandbox={__options:options,console};vm.createContext(sandbox);
    for(const file of ['test/runtime/host-fixture.js','dist/AndroidAutomation.js'])
        vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),sandbox,{filename:file});
    return sandbox.__host;
}

test('AutoJs6 mock host completes fixture only with one input and independent OCR evidence', () => {
    const h = fakeHost();
    h.press('selftest');
    const r = h.report();
    assert.equal(r.status, 'verified');
    assert.equal(r.deviceValidation, 'fixture_observed_only');
    assert.equal(r.actionCount, 1);
    assert.equal(r.verificationFrames, 2);
    assert.equal(h.state.tapCommands, 1);
    assert.equal(h.state.captureStops, 1);
    assert.equal(JSON.stringify(r).includes('TEST '), false);
});

test('AutoJs6 fixture leaves display orientation unlocked', () => {
    const h=fakeHost();
    assert.equal(h.state.orientationRequests, 0);
});

test('dedicated rotation fixture detects geometry drift before requesting input', () => {
    const h=fakeHost({rotateAfterFirstCapture: true});
    h.press('rotation');
    assert.equal(h.report().status, 'blocked');
    assert.equal(h.report().reason, 'ROTATION_CHANGED');
    assert.equal(h.report().actionCount, 0);
    assert.equal(h.state.tapCommands, 0);
    assert.ok(h.ui.status.history.some(s => s.indexOf('8 秒内旋转手机') >= 0));
});

test('mock read-only Star Rail probe cannot dispatch input', () => {
    const h = fakeHost({foreground: 'com.miHoYo.hkrpg'});
    h.press('observe');
    const r = h.report();
    assert.equal(r.status, 'observed');
    assert.equal(r.actionCount, 0);
    assert.equal(r.visualSummary.observedFrames, 2);
    assert.equal(h.state.tapCommands, 0);
});

test('missing Shizuku authorization or capture permission aborts before input', () => {
    for (const options of [{shizukuOperational: false}, {allowCapture: false}]) {
        const h = fakeHost(options);
        h.press('selftest');
        assert.equal(h.report().status, 'blocked');
        assert.equal(h.state.tapCommands, 0);
        assert.equal(h.report().actionCount, 0);
    }
});

test('last-moment foreground switch at adapter boundary blocks input', () => {
    const h = fakeHost({lateFocusSwitch: true});
    h.press('selftest');
    assert.equal(h.report().status, 'blocked');
    assert.equal(h.report().reason, 'FOREGROUND_CHANGED');
    assert.equal(h.state.tapCommands, 0);
    assert.equal(h.report().actionCount, 0);
    assert.ok(h.state.focusChecks >= 3);
});

test('last-moment geometry change at adapter boundary blocks input', () => {
    const h = fakeHost({lateRotation: true});
    h.press('selftest');
    assert.equal(h.report().status, 'blocked');
    assert.equal(h.report().reason, 'ROTATION_CHANGED');
    assert.equal(h.state.tapCommands, 0);
    assert.equal(h.report().actionCount, 0);
    assert.ok(h.state.geometryChecks >= 2);
});

test('unknown Shizuku input result is recorded and not retried', () => {
    const h = fakeHost({failInput: true});
    h.press('selftest');
    assert.equal(h.report().status, 'blocked');
    assert.equal(h.report().reason, 'SHIZUKU_COMMAND_FAILED');
    assert.equal(h.report().actionCount, 1);
    assert.equal(h.state.tapCommands, 1);
});

for (const [option, reason] of [
    ['switchDuringInputPersistence', 'FOREGROUND_CHANGED'],
    ['cancelDuringInputPersistence', 'CANCELLED'],
    ['rotateDuringInputPersistence', 'ROTATION_CHANGED'],
    ['inputPersistenceDelay', 'STALE_FRAME']
]) test('input report persistence cannot bypass ' + option, () => {
    const h = fakeHost({[option]: option === 'inputPersistenceDelay' ? 2600 : true});
    h.press('selftest');
    assert.equal(h.report().reason, reason);
    assert.equal(h.state.tapCommands, 0);
    assert.equal(h.report().actionCount, 1); // Intent persisted; no command delivered.
});
