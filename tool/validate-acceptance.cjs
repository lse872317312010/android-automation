'use strict';
// Offline shape/invariant validation. Operator assertions are not cryptographic proof.
const fs = require('node:fs');
const scenarios = Object.freeze([
    'fixture', 'capture_denied', 'shizuku_denied', 'foreground_switch',
    'rotation', 'stop', 'cold_restart', 'starrail_read_only'
]);
function validate(record, binding) {
    const errors = [];
    function requireValue(ok, code) { if (!ok) errors.push(code); }
    function exactKeys(value, keys, code) {
        const ok = value && typeof value === 'object' && !Array.isArray(value);
        requireValue(ok, code);
        if (ok) requireValue(Object.keys(value).every(k => keys.includes(k)), code + '_FIELDS');
        return ok;
    }
    if (!exactKeys(record, ['schema', 'environment', 'synthetic', 'commit', 'scriptSha256',
        'operatorObserved', 'fixtureUnassisted', 'cases'], 'RECORD')) return errors;
    requireValue(record.schema === 'android-automation.acceptance.v1', 'SCHEMA');
    requireValue(record.environment === 'physical_redmi', 'ENVIRONMENT');
    requireValue(record.synthetic === false, 'SYNTHETIC_OR_TEMPLATE');
    requireValue(record.operatorObserved === true, 'OPERATOR_OBSERVATION_REQUIRED');
    requireValue(record.fixtureUnassisted === true, 'UNASSISTED_FIXTURE_REQUIRED');
    requireValue(binding && /^[a-f0-9]{40}$/.test(binding.commit || '') &&
        /^[a-f0-9]{64}$/.test(binding.scriptSha256 || ''), 'EXPECTED_BINDING_REQUIRED');
    requireValue(/^[a-f0-9]{40}$/.test(record.commit || '') && record.commit === binding?.commit, 'COMMIT_MISMATCH');
    requireValue(/^[a-f0-9]{64}$/.test(record.scriptSha256 || '') &&
        record.scriptSha256 === binding?.scriptSha256, 'SCRIPT_MISMATCH');
    if (!Array.isArray(record.cases)) { errors.push('CASES'); return errors; }
    requireValue(record.cases.length === scenarios.length, 'CASE_COUNT');
    const seen = new Set(), runIds = new Set();
    for (const entry of record.cases) {
        if (!exactKeys(entry, ['scenario', 'result', 'observedInputCount', 'run'], 'CASE')) continue;
        requireValue(scenarios.includes(entry.scenario) && !seen.has(entry.scenario), 'CASE_ID');
        seen.add(entry.scenario);
        requireValue(entry.result === 'pass', 'CASE_PENDING_OR_FAILED');
        const r = entry.run;
        if (!exactKeys(r, ['runId', 'mode', 'status', 'reason', 'actionCount', 'verificationFrames', 'deviceValidation'], 'RUN')) continue;
        requireValue(typeof r.runId === 'string' && /^[a-f0-9-]{36}$/.test(r.runId) && !runIds.has(r.runId), 'RUN_ID');
        runIds.add(r.runId);
        const fixture = entry.scenario === 'fixture';
        // Requested count may be one even when a late guard prevented injection.
        requireValue(Number.isInteger(r.actionCount) && r.actionCount >= 0 && r.actionCount <= 1, 'ACTION_BUDGET');
        requireValue(entry.observedInputCount === (fixture ? 1 : 0), 'OBSERVED_INPUT_COUNT');
        requireValue(r.mode === (entry.scenario === 'starrail_read_only' ? 'starrail_probe' : 'fixture'), 'RUN_MODE');
        if (fixture) {
            requireValue(r.status === 'verified' && r.actionCount === 1 && r.verificationFrames === 2 &&
                r.deviceValidation === 'fixture_observed_only' && r.reason === null, 'FIXTURE_POSTCONDITION');
        } else if (entry.scenario === 'starrail_read_only') {
            requireValue(r.status === 'observed' && r.actionCount === 0 && r.reason === null &&
                r.verificationFrames === 0 && r.deviceValidation === 'read_only_observed_only', 'READ_ONLY');
        } else {
            const required = {
                capture_denied: ['blocked', 'CAPTURE_PERMISSION_DENIED'],
                shizuku_denied: ['blocked', 'SHIZUKU_NOT_AUTHORIZED'],
                foreground_switch: ['blocked', 'FOREGROUND_CHANGED'],
                rotation: ['blocked', 'ROTATION_CHANGED'],
                stop: ['cancelled', 'CANCELLED'],
                cold_restart: ['interrupted', 'PROCESS_INTERRUPTED']
            }[entry.scenario];
            requireValue(required && r.status === required[0] && r.reason === required[1] &&
                r.deviceValidation === 'not_established' && r.verificationFrames === 0, 'NEGATIVE_RESULT');
            if (['capture_denied', 'shizuku_denied'].includes(entry.scenario))
                requireValue(r.actionCount === 0, 'PREFLIGHT_ACTION_COUNT');
        }
    }
    requireValue(scenarios.every(s => seen.has(s)), 'MISSING_CASE');
    return errors;
}
module.exports = {validate, scenarios};
if (require.main === module) {
    try {
        const [recordFile, commit, scriptFile] = process.argv.slice(2);
        const crypto = require('node:crypto');
        const scriptSha256 = crypto.createHash('sha256').update(fs.readFileSync(scriptFile)).digest('hex');
        const errors = validate(JSON.parse(fs.readFileSync(recordFile, 'utf8')), {commit, scriptSha256});
        // Print only codes. Never echo supplied values, file contents, or exception text.
        console.log(JSON.stringify({status: errors.length ? 'rejected' : 'ready_for_review', errors}));
        process.exitCode = errors.length ? 1 : 0;
    } catch (_) { console.log('{"status":"rejected","errors":["INVALID_INPUT"]}'); process.exitCode = 1; }
}
