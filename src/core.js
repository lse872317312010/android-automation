/* Portable policy; no Android, network, or Personal OS authority. */
var VisualLoop = (function () {
    function normalize(s) { return String(s).replace(/\s+/g, '').toUpperCase(); }
    function fail(code) { throw new Error(code); }
    function target(frame, text, confidence) {
        var hits = frame.items.filter(function (v) {
            return normalize(v.text) === normalize(text) &&
                isFinite(v.confidence) && v.confidence >= confidence;
        });
        if (hits.length !== 1) fail(hits.length ? 'AMBIGUOUS_TARGET' : 'TARGET_NOT_FOUND');
        var b = hits[0].bounds;
        if (![b.left, b.top, b.right, b.bottom].every(isFinite) ||
            b.left < 0 || b.top < 0 || b.right > frame.width || b.bottom > frame.height ||
            b.right <= b.left || b.bottom <= b.top) fail('INVALID_BOUNDS');
        return {x: Math.round((b.left + b.right) / 2), y: Math.round((b.top + b.bottom) / 2)};
    }
    function expected(frame, labels, min, confidence, exact) {
        return labels.filter(function (label) {
            return frame.items.some(function (v) {
                if (!isFinite(v.confidence) || v.confidence < confidence) return false;
                var observed = normalize(v.text), needle = normalize(label);
                return exact === true ? observed === needle : observed.indexOf(needle) >= 0;
            });
        }).length >= min;
    }
    // Observe-only diagnostic. Deliberately has no access to io.tap or action stages.
    function probe(io, spec) {
        var deadline = io.now() + Math.min(Number(spec.timeoutMs) || 15000, 15000);
        var snapshots = [], last = null;
        for (var i = 0; i < 2; i++) {
            if (io.cancelled()) fail('CANCELLED');
            if (io.now() > deadline) fail('TIMEOUT');
            if (io.foreground() !== spec.packageName) fail('FOREGROUND_CHANGED');
            var f = io.observe();
            if (io.cancelled()) fail('CANCELLED');
            if (io.now() > deadline) fail('TIMEOUT');
            if (io.foreground() !== spec.packageName) fail('FOREGROUND_CHANGED');
            if (!(f.width > 0 && f.height > 0) ||
                f.width !== f.displayWidth || f.height !== f.displayHeight)
                fail('CAPTURE_GEOMETRY_MISMATCH');
            if (last && (f.width !== last.width || f.height !== last.height ||
                f.rotation !== last.rotation)) fail('ROTATION_CHANGED');
            io.checkGeometry(f);
            var matches = f.items.filter(function (item) {
                return isFinite(item.confidence) && item.confidence >= spec.confidence &&
                    normalize(item.text) === normalize(spec.target);
            }).length;
            // Only aggregate counts are returned. Never export recognized text or screen content.
            snapshots.push({ocrCount: f.items.length, targetCount: matches});
            last = f;
            if (i === 0) io.sleep(700);
        }
        return {status: 'observed', summary: {
            observedFrames: snapshots.length,
            ocrCounts: snapshots.map(function (x) { return x.ocrCount; }),
            targetCounts: snapshots.map(function (x) { return x.targetCount; }),
            targetStableUnique: snapshots.every(function (x) { return x.targetCount === 1; }),
            width: last.width, height: last.height, rotation: last.rotation
        }};
    }

    // APK metadata is only an update signal; in-game asset hot patches can occur
    // without changing Android's versionCode.
    function parsePackageDump(raw) {
        var source = String(raw || '');
        var code = /\bversionCode=(\d+)\b/.exec(source);
        if (!code) return null;
        var name = /\bversionName=([^\r\n]*)/.exec(source);
        var value = name ? name[1].trim().slice(0, 80) : '';
        return {versionCode: code[1], versionName: value || null};
    }
    function versionStatus(current, previous, pkg) {
        if (!current || !/^\d+$/.test(String(current.versionCode || ''))) return 'unknown';
        if (!previous || previous.packageName !== pkg ||
            !/^\d+$/.test(String(previous.versionCode || ''))) return 'first_seen';
        return String(current.versionCode) === String(previous.versionCode) ? 'unchanged' : 'changed';
    }
    function run(io, spec) {
        var deadline = io.now() + spec.timeoutMs;
        function guard() {
            if (io.cancelled()) fail('CANCELLED');
            if (io.now() > deadline) fail('TIMEOUT');
            if (io.foreground() !== spec.packageName) fail('FOREGROUND_CHANGED');
        }
        function observe() {
            guard();
            var f = io.observe();
            guard();
            if (!(f.width > 0 && f.height > 0) || f.width !== f.displayWidth ||
                f.height !== f.displayHeight) fail('CAPTURE_GEOMETRY_MISMATCH');
            return f;
        }
        var a = observe();
        if (expected(a, spec.expected, spec.minExpected, spec.confidence, spec.expectedExact === true)) fail('ALREADY_AT_RESULT');
        var p = target(a, spec.target, spec.confidence);
        io.sleep(400);
        var b = observe(), q = target(b, spec.target, spec.confidence);
        if (expected(b, spec.expected, spec.minExpected, spec.confidence, spec.expectedExact === true)) fail('ALREADY_AT_RESULT');
        if (a.width !== b.width || a.height !== b.height || a.rotation !== b.rotation ||
            Math.abs(p.x - q.x) > 8 || Math.abs(p.y - q.y) > 8) fail('UNSTABLE_TARGET');
        guard();
        // Do not act on an OCR result that took too long to produce.
        var frameAge = io.now() - b.capturedAt;
        if (typeof b.capturedAt !== 'number' || !isFinite(frameAge) ||
            frameAge < 0 || frameAge > 2500) fail('STALE_FRAME');
        io.checkGeometry(b);
        guard();
        io.stage('action_requested');
        // Recording a request may block or yield; revalidate before any privileged input.
        guard();
        io.checkGeometry(b);
        guard();
        io.tap(q.x, q.y); // Never retry an uncertain or failed injection.
        io.stage('verifying');
        var consecutive = 0;
        for (var i = 0; i < 8; i++) {
            io.sleep(700);
            var after = observe();
            if (after.width !== b.width || after.height !== b.height || after.rotation !== b.rotation)
                fail('ROTATION_CHANGED');
            consecutive = expected(after, spec.expected, spec.minExpected, spec.confidence, spec.expectedExact === true) ? consecutive + 1 : 0;
            if (consecutive >= 2) { io.stage('verified'); return {status: 'verified', taps: 1, verificationFrames: 2}; }
        }
        fail('POSTCONDITION_NOT_MET');
    }
    return {normalize: normalize, target: target, expected: expected, probe: probe,
        parsePackageDump: parsePackageDump, versionStatus: versionStatus, run: run};
})();
if (typeof module !== 'undefined') module.exports = VisualLoop;
