'use strict';
// Mocked AutoJs6 host contract. No hardware access, shell privileges, or network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fakeHost(options = {}) {
    const store = new Map();
    const state = {
        foreground: options.foreground || 'autojs6.fixture',
        tapCommands: 0, captureStops: 0, armed: false, focusChecks: 0,
        geometryChecks: 0, clicked: false
    };
    let clock = 1800000000000, actionPersisted = false;
    class MockDate extends Date {
        constructor(...args) { super(...(args.length ? args : [clock])); }
        static now() { return clock; }
    }
    function control(initial = '') {
        return {
            text: initial, handlers: {},
            setText(value) { this.text = String(value); },
            setEnabled() {},
            on(event, callback) { this.handlers[event] = callback; }
        };
    }
    const ui = {
        target: control('WAIT'), outcome: control('READY'), status: control(),
        selftest: control(), observe: control(), game: control(),
        stop: control(), copy: control(),
        layout() {}, run(callback) { callback(); }
    };
    function FakeFile(name) { this.path = String(name); }
    FakeFile.prototype.exists = function () { return store.has(this.path); };
    FakeFile.prototype.delete = function () { return store.delete(this.path); };
    FakeFile.prototype.renameTo = function (destination) {
        if (!store.has(this.path)) return false;
        store.set(destination.path, store.get(this.path));
        store.delete(this.path);
        return true;
    };
    const files = {
        exists: name => store.has(String(name)),
        read: name => store.get(String(name)),
        write: (name, value) => {
            const serialized = String(value);
            store.set(String(name), serialized);
            const record = JSON.parse(serialized);
            if (!actionPersisted && record.status === 'running' && record.actionCount === 1) {
                actionPersisted = true;
                if (options.switchDuringInputPersistence) state.foreground = 'com.other.app';
                if (options.cancelDuringInputPersistence) ui.stop.handlers.click();
                if (options.rotateDuringInputPersistence) state.rotated = true;
                clock += options.inputPersistenceDelay || 0;
            }
            if (!state.armed && serialized.includes('"stage": "action_requested"')) {
                state.armed = true;
                state.focusChecks = 0;
                state.geometryChecks = 0;
            }
        }
    };
    function shizuku(command) {
        if (command.startsWith('dumpsys package ')) {
            return {code: 0, result: 'versionCode=5012301\nversionName=3.9.0'};
        }
        if (command.startsWith('input tap ')) {
            state.tapCommands++;
            if (options.failInput) return {code: 1, result: ''};
            if (ui.target.handlers.click) ui.target.handlers.click();
        }
        return {code: 0, result: 'ok'};
    }
    shizuku.state = {isOperational: options.shizukuOperational !== false};
    shizuku.currentPackage = () => {
        if (state.armed && options.lateFocusSwitch) {
            if (++state.focusChecks >= 3) return 'com.other.app';
        }
        return state.foreground;
    };
    const android = {
        content: {
            pm: {ActivityInfo: {SCREEN_ORIENTATION_PORTRAIT: 1}},
            Context: {WINDOW_SERVICE: 'window'}
        },
        util: {DisplayMetrics: class {}}
    };
    const context = {
        getFilesDir: () => '/mock',
        getPackageName: () => 'autojs6.fixture',
        getPackageManager: () => ({
            getPackageInfo: () => ({versionName: '6.7.0'})
        }),
        getSystemService: () => ({
            getDefaultDisplay: () => ({
                getRealMetrics: metrics => {
                    metrics.widthPixels = 1080;
                    metrics.heightPixels = 2400;
                },
                getRotation: () => {
                    if (state.rotated) return 1;
                    if (state.armed && options.lateRotation) {
                        if (++state.geometryChecks >= 2) return 1;
                    }
                    return 0;
                }
            })
        })
    };
    const images = {
        requestScreenCapture: () => options.allowCapture !== false,
        captureScreen: () => ({
            getWidth: () => 1080, getHeight: () => 2400, recycle() {}
        }),
        copy: image => image,
        stopScreenCapture: () => { state.captureStops++; }
    };
    const ocr = {
        mlkit: {
            detect: () => [{
                text: state.foreground === 'autojs6.fixture'
                    ? (state.clicked ? ui.outcome.text : ui.target.text) : '设置',
                confidence: 0.99,
                bounds: {left: 100, top: 200, right: 400, bottom: 300}
            }]
        }
    };
    // A tap dispatches the event synchronously in the fake host.
    const originalTap = ui.target.on.bind(ui.target);
    ui.target.on = (event, handler) => originalTap(event, () => {
        handler();
        state.clicked = true;
    });
    const sandbox = {
        ui, android, context, images, ocr, files, shizuku,
        activity: {setRequestedOrientation() {}},
        java: {io: {File: FakeFile}, util: {UUID: {randomUUID: () => 'mock-run'}}},
        threads: {start: fn => fn()},
        sleep() {}, status: undefined,
        toast() {}, setClip() {},
        console
    };
    sandbox.Date = MockDate;
    vm.createContext(sandbox);
    const root = path.join(__dirname, '..');
    vm.runInContext(fs.readFileSync(path.join(root, 'src/core.js'), 'utf8'), sandbox,
        {filename: 'src/core.js'});
    vm.runInContext(fs.readFileSync(path.join(root, 'src/android.js'), 'utf8'), sandbox,
        {filename: 'src/android.js'});
    return {
        press: name => ui[name].handlers.click(),
        report: () => JSON.parse(store.get('/mock/android-automation-run.json')),
        state, ui
    };
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
