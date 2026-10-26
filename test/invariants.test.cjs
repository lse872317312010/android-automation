/* Deterministic, hardware-free test adapter. Never requests a real touch. */
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js');

const TARGET = 'TEST 123456';
const RESULT = 'PASS 123456';

function rng(seed) {
    let state = seed >>> 0;
    return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
function frame(text, bounds, override = {}) {
    const item = {text, confidence: 0.99, bounds: {...bounds}};
    return {
        width: 1080, height: 2400, displayWidth: 1080, displayHeight: 2400,
        rotation: 0, items: [item], ...override
    };
}
function adapter(frames, options = {}) {
    let now = 0, index = 0, tapCount = 0, observed = 0, foreground = 'fixture', cancelled = false;
    const stages = [];
    const io = {
        now: () => now,
        sleep: ms => {
            now += ms;
            if (options.foregroundOnSleep) foreground = 'other.package';
            if (options.cancelOnSleep) cancelled = true;
        },
        cancelled: () => cancelled,
        foreground: () => foreground,
        checkGeometry: () => {},
        stage: stage => stages.push(stage),
        tap: () => {
            tapCount++;
            if (options.tapFails) throw new Error('INJECTION_UNCERTAIN');
        },
        observe: () => {
            const f = frames[Math.min(index++, frames.length - 1)];
            observed++;
            if (options.slowOnShot === observed) now += 20000;
            return {...f, capturedAt: options.staleOnShot === observed ? now - 10000 : now};
        }
    };
    const spec = {
        packageName: 'fixture', target: TARGET, expected: [RESULT],
        minExpected: 1, confidence: 0.65, timeoutMs: 15000,
        expectedExact: true
    };
    return {io, spec, taps: () => tapCount, stages, seen: () => observed};
}
function geometry(next) {
    const left = 20 + Math.floor(next() * 600);
    const top = 20 + Math.floor(next() * 1200);
    return {left, top, right: left + 100, bottom: top + 40};
}

test('seeded negative cases never dispatch an input (512 variations)', () => {
    const next = rng(0x5afe2026);
    for (let i = 0; i < 512; i++) {
        const b = geometry(next);
        const valid = frame(TARGET, b);
        const good = frame(RESULT, b);
        let frames = [valid, valid];
        const opt = {};
        let reason;
        switch (i % 10) {
            case 0:
                frames = [frame(TARGET, b, {items: [valid.items[0], valid.items[0]]})];
                reason = 'AMBIGUOUS_TARGET'; break;
            case 1:
                frames = [frame(TARGET, b, {items: [{...valid.items[0], confidence: 0.01}]})];
                reason = 'TARGET_NOT_FOUND'; break;
            case 2:
                frames = [frame(TARGET, b, {items: [{...valid.items[0], bounds: {...b, right: 9999}}]})];
                reason = 'INVALID_BOUNDS'; break;
            case 3:
                frames = [good];
                reason = 'ALREADY_AT_RESULT'; break;
            case 4:
                frames = [frame(TARGET, b, {displayWidth: 1079})];
                reason = 'CAPTURE_GEOMETRY_MISMATCH'; break;
            case 5:
                frames = [valid, frame(TARGET, b, {rotation: 1})];
                reason = 'ROTATION_CHANGED'; break;
            case 6:
                frames = [valid, frame(TARGET, b, {items: [valid.items[0], valid.items[0]]})];
                reason = 'AMBIGUOUS_TARGET'; break;
            case 7:
                opt.staleOnShot = 2;
                reason = 'STALE_FRAME'; break;
            case 8:
                opt.foregroundOnSleep = true;
                reason = 'FOREGROUND_CHANGED'; break;
            default:
                opt.slowOnShot = 2;
                reason = 'TIMEOUT';
        }
        const h = adapter(frames, opt);
        assert.throws(() => core.run(h.io, h.spec), new RegExp(reason), 'seed=0x5afe2026 case=' + i);
        assert.equal(h.taps(), 0, 'unsafe tap seed=0x5afe2026 case=' + i);
    }
});

test('seeded valid paths do exactly one tap and require two result frames (128 cases)', () => {
    const next = rng(0xa11ce202);
    for (let i = 0; i < 128; i++) {
        const b = geometry(next);
        const v = frame(TARGET, b), pass = frame(RESULT, b);
        const h = adapter([v, v, frame('loading', b), pass, pass]);
        const result = core.run(h.io, h.spec);
        assert.equal(result.status, 'verified');
        assert.equal(h.taps(), 1, 'multiple taps case=' + i);
        assert.deepEqual(h.stages, ['action_requested', 'verifying', 'verified']);
        assert.equal(result.verificationFrames, 2);
    }
});

test('read-only mode has no opportunity to tap, even with distracting OCR (128 cases)', () => {
    const next = rng(0x10203040);
    for (let i = 0; i < 128; i++) {
        const b = geometry(next);
        const candidates = Array.from({length: Math.floor(next() * 12)}, (_, n) => ({
            text: n % 2 ? TARGET : '其他文本',
            confidence: next(),
            bounds: {...b}
        }));
        const shot = frame('anything', b, {items: candidates});
        const h = adapter([shot, shot]);
        h.io.tap = () => { throw new Error('READ_ONLY_MUST_NOT_ACT'); };
        const out = core.probe(h.io, h.spec);
        assert.equal(out.status, 'observed');
        assert.equal(out.summary.observedFrames, 2);
        assert.equal(h.taps(), 0);
        assert.equal(JSON.stringify(out).includes(TARGET), false, 'OCR content escaped summary');
    }
});

test('uncertain injection is never retried; verifier does not declare a false completion', () => {
    const b = {left: 10, top: 100, right: 130, bottom: 150};
    const base = frame(TARGET, b);
    const h = adapter([base, base], {tapFails: true});
    assert.throws(() => core.run(h.io, h.spec), /INJECTION_UNCERTAIN/);
    assert.equal(h.taps(), 1);

    const intermittent = adapter([
        base, base, frame(RESULT, b), frame('loading', b), frame(RESULT, b),
        frame('loading', b), frame(RESULT, b), frame('loading', b),
        frame(RESULT, b), frame('loading', b)
    ]);
    assert.throws(() => core.run(intermittent.io, intermittent.spec), /POSTCONDITION_NOT_MET/);
    assert.equal(intermittent.taps(), 1);
});

test('nonce postcondition must not match a longer or embedded nonce', () => {
    const b = {left: 10, top: 100, right: 130, bottom: 150};
    const valid = frame(TARGET, b);
    const h = adapter([valid, valid, frame('PASS 1234567', b), frame('PRE PASS 123456', b)]);
    assert.throws(() => core.run(h.io, h.spec), /POSTCONDITION_NOT_MET/);
    assert.equal(h.taps(), 1);
});

test('read-only probe cannot bypass cancellation, even after screenshot returns', () => {
    const b = {left: 10, top: 100, right: 130, bottom: 150};
    const h = adapter([frame(TARGET, b), frame(TARGET, b)], {cancelOnSleep: true});
    assert.throws(() => core.probe(h.io, h.spec), /CANCELLED/);
    assert.equal(h.taps(), 0);
});
