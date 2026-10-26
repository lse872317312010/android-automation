/* AutoJs6 6.7.0 host. Generated deliverable starts with the ui directive. */
var busy = false, cancelled = false, lastReport = null, selectedMode = null;
var evidenceFile = String(context.getFilesDir()) + '/android-automation-run.json';
var clientVersionFile = String(context.getFilesDir()) + '/starrail-client-version.json';
var nonce = String(Math.floor(100000 + Math.random() * 900000));
var clicked = false;
ui.layout('<vertical padding="20" bg="#FFFFFF">' +
    '<text text="Android Automation · 视觉闭环 0.3" textSize="23sp" textColor="#14213D"/>' +
    '<text text="先运行自测。授权截图时选择整个屏幕。每次运行最多点击一次。" textSize="16sp" marginTop="12"/>' +
    '<button id="selftest" text="1. 开始本机闭环自测" marginTop="12"/>' +
    '<button id="rotation" text="2. 自测旋转保护（仅测试页）"/>' +
    '<button id="observe" text="3. 星铁只读截图/识别诊断（绝不点击）"/>' +
    '<button id="game" text="4. 星铁设置入口单步测试（会点击一次）"/>' +
    '<button id="stop" text="停止（也可从 AutoJs6 停止脚本）"/>' +
    '<text id="status" text="待运行：请先在 AutoJs6 抽屉授权 Shizuku" textSize="16sp" marginTop="12"/>' +
    '<button id="target" text="WAIT" textSize="30sp" h="96" marginTop="24"/>' +
    '<text id="outcome" text="READY" textSize="30sp" textColor="#14213D" gravity="center"/>' +
    '<button id="copy" text="复制最近的诊断报告" marginTop="24"/>' +
    '</vertical>');
function status(text) { ui.run(function () { ui.status.setText(text); }); }
function persist(report) {
    var tmp = evidenceFile + '.tmp';
    files.write(tmp, JSON.stringify(report, null, 2));
    if (!new java.io.File(tmp).renameTo(new java.io.File(evidenceFile))) throw new Error('EVIDENCE_WRITE_FAILED');
    lastReport = report;
}
try {
    if (files.exists(evidenceFile)) {
        lastReport = JSON.parse(files.read(evidenceFile));
        if (lastReport.status === 'running') {
            lastReport.status = 'interrupted'; lastReport.reason = 'PROCESS_INTERRUPTED'; persist(lastReport);
        }
        status('上次结果：' + lastReport.status + ' / ' + (lastReport.reason || lastReport.mode));
    }
} catch (_) { status('历史诊断不可读取；本次可重新测试。'); }
ui.target.on('click', function () {
    if (!busy || selectedMode !== 'fixture' || clicked) return;
    clicked = true;
    ui.target.setText('DONE'); ui.outcome.setText('PASS ' + nonce);
});
ui.stop.on('click', function () { cancelled = true; status('已请求停止；后续检查将拒绝触控。'); });
ui.copy.on('click', function () {
    if (busy) return;
    if (lastReport) { setClip(JSON.stringify(lastReport, null, 2)); toast('已复制诊断 JSON（不含截图或识别原文）'); }
});
function readClientVersionBaseline() {
    try {
        if (!files.exists(clientVersionFile)) return null;
        var value = JSON.parse(files.read(clientVersionFile));
        return value && value.schema === 'starrail-client-version.v1' ? value : null;
    } catch (_) { return null; }
}
function writeClientVersionBaseline(pkg, version) {
    var tmp = clientVersionFile + '.tmp';
    files.write(tmp, JSON.stringify({schema: 'starrail-client-version.v1',
        packageName: pkg, versionCode: version.versionCode,
        versionName: version.versionName, observedAt: new Date().toISOString()}));
    var dest = new java.io.File(clientVersionFile);
    // Let same-directory rename replace the file; retain the old baseline on
    // failure instead of deleting it before the replacement is known to work.
    if (!new java.io.File(tmp).renameTo(dest)) throw new Error('VERSION_BASELINE_WRITE_FAILED');
}
function diagnosticReason(error) {
    var allowed = ['EVIDENCE_WRITE_FAILED', 'VERSION_BASELINE_WRITE_FAILED',
        'SHIZUKU_NOT_AUTHORIZED', 'SHIZUKU_COMMAND_FAILED', 'CAPTURE_PERMISSION_DENIED',
        'CANCELLED', 'TIMEOUT', 'STAR_RAIL_NOT_FOREGROUND',
        'GAME_VERSION_CHANGED_RUN_READ_ONLY_PROBE', 'GAME_VERSION_BASELINE_REQUIRED',
        'FOREGROUND_CHANGED', 'ROTATION_CHANGED', 'INVALID_TAP_COORDINATES',
        'STALE_FRAME', 'TARGET_NOT_FOUND', 'AMBIGUOUS_TARGET', 'INVALID_BOUNDS',
        'CAPTURE_GEOMETRY_MISMATCH', 'ALREADY_AT_RESULT', 'UNSTABLE_TARGET',
        'POSTCONDITION_NOT_MET'];
    try {
        var message = String(error && error.message || error);
        return allowed.indexOf(message) >= 0 ? message : 'RUNTIME_ERROR';
    } catch (_) { return 'RUNTIME_ERROR'; }
}
function shellChecked(command) {
    var result = shizuku(command);
    if (Number(result.code) !== 0) throw new Error('SHIZUKU_COMMAND_FAILED');
    return String(result.result);
}
function geometry() {
    var display = context.getSystemService(android.content.Context.WINDOW_SERVICE).getDefaultDisplay();
    var metrics = new android.util.DisplayMetrics(); display.getRealMetrics(metrics);
    return {width: Number(metrics.widthPixels), height: Number(metrics.heightPixels), rotation: Number(display.getRotation())};
}
function start(mode, rotationTest) {
    if (busy) return;
    if (selectedMode !== null) { status('请退出并重新运行脚本后再测，确保截图方向与权限重新初始化。'); return; }
    busy = true; cancelled = false; selectedMode = mode;
    ui.selftest.setEnabled(false); ui.rotation.setEnabled(false); ui.observe.setEnabled(false); ui.game.setEnabled(false);
    threads.start(function () {
        var report = {schema: 'android-automation.run.v1', adapter: 'autojs6-shizuku',
            runtimeRequired: '6.7.0', mode: mode, runId: String(java.util.UUID.randomUUID()),
            startedAt: new Date().toISOString(), status: 'running', stage: 'preflight',
            actionCount: 0, frames: [], deviceValidation: 'not_established'};
        var captureGranted = false, started = Date.now(), isGame = (mode !== 'fixture'),
            clientVersion = null, clientStatus = 'not_applicable';
        try {
            report.runtimeVersion = String(context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName);
            persist(report);
            if (!shizuku.state.isOperational) throw new Error('SHIZUKU_NOT_AUTHORIZED');
            shellChecked('id'); // Binds the user service before currentPackage().
            if (mode === 'fixture') {
                ui.run(function () { ui.target.setText('TEST ' + nonce); ui.outcome.setText('READY'); });
            }
            status(mode === 'fixture' && rotationTest ?
                '允许整个屏幕截图。首帧后等待 8 秒，请旋转手机以测试安全停止。' :
                (mode === 'fixture' ? '允许整个屏幕截图，然后保持本页，不要手动点测试按钮。' :
                (mode === 'starrail_probe' ? '只读模式：截图授权后有 15 秒切到星铁，任何页面均可；不会点击。' :
                '单击模式：截图授权后 15 秒内切到星铁手机菜单，保持“设置”入口可见。')));
            if (!images.requestScreenCapture(isGame)) throw new Error('CAPTURE_PERMISSION_DENIED');
            captureGranted = true;
            sleep(mode === 'fixture' ? 1500 : 15000);
            if (cancelled) throw new Error('CANCELLED');
            var pkg = mode === 'fixture' ? String(context.getPackageName()) : String(shizuku.currentPackage());
            if (isGame && ['com.miHoYo.hkrpg', 'com.miHoYo.hkrpg.bilibili', 'com.HoYoverse.hkrpgoversea'].indexOf(pkg) < 0)
                throw new Error('STAR_RAIL_NOT_FOREGROUND');
            if (isGame) {
                // Package is taken from a fixed allowlist above, never arbitrary OCR.
                try {
                    clientVersion = VisualLoop.parsePackageDump(shellChecked('dumpsys package ' + pkg));
                } catch (_) { clientVersion = null; }
                clientStatus = VisualLoop.versionStatus(clientVersion, readClientVersionBaseline(), pkg);
                report.clientVersion = clientVersion;
                report.clientVersionStatus = clientStatus;
                // Explicit game input requires a successful no-touch observation first.
                // If the installed APK was updated, refuse the old clickable workflow.
                if (mode === 'starrail' && clientStatus !== 'unchanged')
                    throw new Error(clientStatus === 'changed' ? 'GAME_VERSION_CHANGED_RUN_READ_ONLY_PROBE' :
                        'GAME_VERSION_BASELINE_REQUIRED');
                persist(report);
            }
            var spec = {packageName: pkg, target: mode === 'fixture' ? 'TEST ' + nonce : '设置',
                expected: mode === 'fixture' ? ['PASS ' + nonce] : ['画面', '声音', '音量', '分辨率', '帧率'],
                minExpected: mode === 'fixture' ? 1 : 2, confidence: 0.65, timeoutMs: 45000,
                expectedExact: mode === 'fixture', confirmationDelayMs: rotationTest ? 8000 : 400};
            var lastObservedFrame = null;
            var inputDeadline = Date.now() + spec.timeoutMs;
            var io = {
                now: function () { return Date.now(); }, sleep: sleep,
                cancelled: function () { return cancelled; },
                foreground: function () { return String(shizuku.currentPackage()); },
                stage: function (s) { report.stage = s; persist(report); },
                checkGeometry: function (frame) {
                    var g = geometry();
                    if (g.width !== frame.width || g.height !== frame.height || g.rotation !== frame.rotation)
                        throw new Error('ROTATION_CHANGED');
                },
                tap: function (x, y) {
                    if (cancelled) throw new Error('CANCELLED');
                    // Revalidate at the platform boundary, not only at strategy time.
                    if (String(shizuku.currentPackage()) !== pkg) throw new Error('FOREGROUND_CHANGED');
                    var currentGeometry = geometry();
                    if (!lastObservedFrame || currentGeometry.width !== lastObservedFrame.width ||
                        currentGeometry.height !== lastObservedFrame.height ||
                        currentGeometry.rotation !== lastObservedFrame.rotation)
                        throw new Error('ROTATION_CHANGED');
                    if (!isFinite(x) || !isFinite(y) || Math.floor(x) !== x || Math.floor(y) !== y ||
                        x < 0 || y < 0 || x >= currentGeometry.width || y >= currentGeometry.height)
                        throw new Error('INVALID_TAP_COORDINATES');
                    if (cancelled) throw new Error('CANCELLED');
                    report.actionCount = 1; persist(report); // Requested, not necessarily delivered.
                    // Persistence can yield to a stop/focus/rotation change. Check after
                    // the final write, with no further disk operation before injection.
                    if (cancelled) throw new Error('CANCELLED');
                    if (Date.now() > inputDeadline) throw new Error('TIMEOUT');
                    if (String(shizuku.currentPackage()) !== pkg) throw new Error('FOREGROUND_CHANGED');
                    var finalGeometry = geometry();
                    if (finalGeometry.width !== lastObservedFrame.width ||
                        finalGeometry.height !== lastObservedFrame.height ||
                        finalGeometry.rotation !== lastObservedFrame.rotation) throw new Error('ROTATION_CHANGED');
                    var finalAge = Date.now() - lastObservedFrame.capturedAt;
                    if (!isFinite(finalAge) || finalAge < 0 || finalAge > 2500) throw new Error('STALE_FRAME');
                    if (cancelled) throw new Error('CANCELLED');
                    shellChecked('input tap ' + x + ' ' + y);
                },
                observe: function () {
                    var at = Date.now(), g = geometry();
                    // captureScreen owns its cached image; only recycle our explicit copy.
                    var capturedFrom = Date.now();
                    var img = images.copy(images.captureScreen());
                    var captureMs = Date.now() - capturedFrom;
                    try {
                        var ocrFrom = Date.now();
                        var found = ocr.mlkit.detect(img), ocrMs = Date.now() - ocrFrom, items = [];
                        for (var i = 0; i < found.length; i++) {
                            var r = found[i], b = r.bounds;
                            items.push({text: String(r.text), confidence: Number(r.confidence),
                                bounds: {left: Number(b.left), top: Number(b.top), right: Number(b.right), bottom: Number(b.bottom)}});
                        }
                        var frame = {width: Number(img.getWidth()), height: Number(img.getHeight()),
                            displayWidth: g.width, displayHeight: g.height, rotation: g.rotation,
                            capturedAt: at, items: items};
                        lastObservedFrame = frame;
                        report.frames.push({width: frame.width, height: frame.height, rotation: g.rotation,
                            ocrCount: items.length, captureMs: captureMs, ocrMs: ocrMs,
                            durationMs: Date.now() - at});
                        if (rotationTest && report.frames.length === 1)
                            status('首帧已截取：请在 8 秒内旋转手机；检测到方向变化会阻止点击。');
                        persist(report);
                        return frame;
                    } finally { img.recycle(); }
                }
            };
            var result = mode === 'starrail_probe' ? VisualLoop.probe(io, spec) : VisualLoop.run(io, spec);
            report.status = result.status;
            if (mode === 'starrail_probe') {
                report.visualSummary = result.summary;
                if (clientVersion) {
                    writeClientVersionBaseline(pkg, clientVersion);
                    report.clientVersionObservation = 'read_only_only_not_task_validated';
                }
            }
            else report.verificationFrames = result.verificationFrames;
            report.deviceValidation = mode === 'fixture' ? 'fixture_observed_only' :
                (mode === 'starrail_probe' ? 'read_only_observed_only' : 'single_step_observed_only');
        } catch (e) {
            report.status = cancelled ? 'cancelled' : 'blocked';
            report.reason = cancelled ? 'CANCELLED' : diagnosticReason(e);
            // No raw platform exception, package list, screenshot, UID or OCR text in export.
        } finally {
            report.finishedAt = new Date().toISOString(); report.durationMs = Date.now() - started;
            try { persist(report); } catch (_) { report.status = 'blocked'; report.reason = 'EVIDENCE_WRITE_FAILED'; lastReport = report; }
            if (captureGranted) { try { images.stopScreenCapture(); } catch (_) {} }
            busy = false;
            status('结果：' + report.status + (report.reason ? ' / ' + report.reason : '') + '。可复制诊断；再次测试请重新运行脚本。');
        }
    });
}
ui.selftest.on('click', function () { start('fixture'); });
ui.rotation.on('click', function () { start('fixture', true); });
ui.observe.on('click', function () { start('starrail_probe'); });
ui.game.on('click', function () { start('starrail'); });
