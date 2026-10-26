/* Draft Skill contract only. No loader, executor, filesystem access or promotion API. */
var SkillContract = (function () {
    var SCHEMA_ID = 'android-automation.skill.v0.draft';
    var CAPABILITIES = ['capture.fullscreen', 'recognize.ocr', 'act.tap', 'verify.semantic'];
    var ENGINES = ['maafw', 'autojs6-shizuku'];
    var ROOT_KEYS = ['$comment', 'schema', 'skill', 'compatibility', 'execution',
        'verification', 'promotion', 'rollback', 'provenance'];

    function object(value, keys, code, errors) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            errors.push(code);
            return false;
        }
        var actual = Object.keys(value), i;
        if (actual.length !== keys.length) errors.push(code + '_FIELDS');
        for (i = 0; i < keys.length; i++)
            if (!Object.prototype.hasOwnProperty.call(value, keys[i])) errors.push(code + '_FIELDS');
        for (i = 0; i < actual.length; i++)
            if (keys.indexOf(actual[i]) < 0) errors.push(code + '_FIELDS');
        return true;
    }
    function requireThat(condition, code, errors) {
        if (!condition) errors.push(code);
    }
    function string(value, pattern, min, max) {
        return typeof value === 'string' && value.length >= min && value.length <= max &&
            (!pattern || pattern.test(value));
    }
    function nullableString(value, pattern, max) {
        return value === null || string(value, pattern, 0, max);
    }
    function unique(values) {
        var seen = [], i;
        for (i = 0; i < values.length; i++) {
            if (seen.indexOf(values[i]) >= 0) return false;
            seen.push(values[i]);
        }
        return true;
    }
    function versionCompare(a, b) {
        if (a.length !== b.length) return a.length < b.length ? -1 : 1;
        return a === b ? 0 : (a < b ? -1 : 1);
    }

    function validateDraft(manifest) {
        var errors = [];
        if (!object(manifest, ROOT_KEYS, 'MANIFEST', errors)) return errors;
        requireThat(string(manifest.$comment, null, 1, 512), 'COMMENT', errors);
        requireThat(manifest.schema === SCHEMA_ID, 'SCHEMA_VERSION', errors);

        if (object(manifest.skill, ['id', 'version', 'gameId', 'description', 'status', 'executionEnabled'],
            'SKILL', errors)) {
            requireThat(string(manifest.skill.id, /^[a-z][a-z0-9]*(?:\.[a-z0-9]+(?:[_-][a-z0-9]+)*)+$/, 3, 96),
                'SKILL_ID', errors);
            requireThat(string(manifest.skill.version, /^\d+\.\d+\.\d+-draft$/, 9, 32),
                'SKILL_VERSION', errors);
            requireThat(string(manifest.skill.gameId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 2, 64), 'GAME_ID', errors);
            requireThat(string(manifest.skill.description, null, 1, 240), 'DESCRIPTION', errors);
            requireThat(manifest.skill.status === 'draft', 'SKILL_STATUS', errors);
            requireThat(manifest.skill.executionEnabled === false, 'EXECUTION_DISABLED', errors);
        }

        if (object(manifest.compatibility,
            ['packages', 'locale', 'apkVersionCode', 'uiSignature', 'engine', 'requiredCapabilities'],
            'COMPATIBILITY', errors)) {
            var c = manifest.compatibility;
            var packagePattern = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
            requireThat(Array.isArray(c.packages) && c.packages.length >= 1 && c.packages.length <= 20 &&
                c.packages.every(function (p) { return string(p, packagePattern, 3, 160); }) &&
                unique(Array.isArray(c.packages) ? c.packages : []), 'PACKAGES', errors);
            requireThat(string(c.locale, /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, 2, 35), 'LOCALE', errors);
            if (object(c.apkVersionCode, ['min', 'max'], 'APK_VERSION', errors)) {
                var v = c.apkVersionCode, digitVersion = /^(0|[1-9]\d{0,29})$/;
                var validPair = v.min === null && v.max === null ||
                    string(v.min, digitVersion, 1, 30) && string(v.max, digitVersion, 1, 30);
                requireThat(validPair, 'VERSION_RANGE', errors);
                if (validPair && v.min !== null)
                    requireThat(versionCompare(v.min, v.max) <= 0, 'VERSION_RANGE_ORDER', errors);
            }
            if (object(c.uiSignature, ['profile', 'requiredAnchors'], 'UI_SIGNATURE', errors)) {
                var ui = c.uiSignature;
                requireThat(nullableString(ui.profile, null, 96), 'UI_PROFILE', errors);
                requireThat(Array.isArray(ui.requiredAnchors) && ui.requiredAnchors.length <= 32 &&
                    ui.requiredAnchors.every(function (x) { return string(x, null, 1, 96); }) &&
                    unique(Array.isArray(ui.requiredAnchors) ? ui.requiredAnchors : []), 'UI_ANCHORS', errors);
                if (Array.isArray(ui.requiredAnchors) && ui.requiredAnchors.length > 0)
                    requireThat(typeof ui.profile === 'string' && ui.profile.length > 0,
                        'UI_PROFILE_REQUIRED', errors);
            }
            if (object(c.engine, ['id', 'minVersion'], 'ENGINE', errors)) {
                requireThat(string(c.engine.id, /^[a-z][a-z0-9-]{1,31}$/, 2, 32) &&
                    ENGINES.indexOf(c.engine.id) >= 0, 'ENGINE_ID', errors);
                requireThat(nullableString(c.engine.minVersion, /^[A-Za-z0-9.+-]{1,48}$/, 48),
                    'ENGINE_VERSION', errors);
            }
            requireThat(Array.isArray(c.requiredCapabilities) && c.requiredCapabilities.length >= 1 &&
                c.requiredCapabilities.length <= CAPABILITIES.length &&
                c.requiredCapabilities.every(function (x) { return CAPABILITIES.indexOf(x) >= 0; }) &&
                unique(Array.isArray(c.requiredCapabilities) ? c.requiredCapabilities : []),
                'CAPABILITIES', errors);
        }

        if (object(manifest.execution, ['inputBudget', 'workflowPath', 'unknownState', 'onVersionDrift'],
            'EXECUTION', errors)) {
            var ex = manifest.execution;
            if (object(ex.inputBudget, ['maxActions', 'maxRetries', 'timeoutMs'], 'INPUT_BUDGET', errors)) {
                requireThat(ex.inputBudget.maxActions === 0, 'ACTION_BUDGET', errors);
                requireThat(ex.inputBudget.maxRetries === 0, 'RETRY_BUDGET', errors);
                requireThat(typeof ex.inputBudget.timeoutMs === 'number' &&
                    Math.floor(ex.inputBudget.timeoutMs) === ex.inputBudget.timeoutMs &&
                    ex.inputBudget.timeoutMs >= 1 && ex.inputBudget.timeoutMs <= 120000,
                    'TIME_BUDGET', errors);
            }
            requireThat(ex.workflowPath === null, 'WORKFLOW_DISABLED', errors);
            requireThat(ex.unknownState === 'block', 'UNKNOWN_STATE', errors);
            requireThat(ex.onVersionDrift === 'quarantine', 'VERSION_DRIFT_POLICY', errors);
        }

        if (object(manifest.verification, ['entryCondition', 'successCondition', 'consecutiveObservations',
            'verificationSource', 'falseCompletionPolicy'], 'VERIFICATION', errors)) {
            var check = manifest.verification;
            requireThat(nullableString(check.entryCondition, null, 512), 'ENTRY_CONDITION', errors);
            requireThat(nullableString(check.successCondition, null, 512), 'SUCCESS_CONDITION', errors);
            requireThat(typeof check.consecutiveObservations === 'number' &&
                Math.floor(check.consecutiveObservations) === check.consecutiveObservations &&
                check.consecutiveObservations >= 2 && check.consecutiveObservations <= 10,
                'OBSERVATION_COUNT', errors);
            requireThat(check.verificationSource === 'deterministic', 'VERIFICATION_SOURCE', errors);
            requireThat(check.falseCompletionPolicy === 'fail_closed', 'FALSE_COMPLETION_POLICY', errors);
        }

        if (object(manifest.promotion, ['offlineRegression', 'androidDeviceValidation', 'review',
            'verifiedOnDevice'], 'PROMOTION', errors)) {
            var promotion = manifest.promotion;
            requireThat(promotion.offlineRegression === 'required' &&
                promotion.androidDeviceValidation === 'required' && promotion.review === 'required' &&
                promotion.verifiedOnDevice === false, 'PROMOTION_GATE', errors);
        }
        if (object(manifest.rollback, ['lastKnownGoodVersion'], 'ROLLBACK', errors))
            requireThat(nullableString(manifest.rollback.lastKnownGoodVersion, /^[A-Za-z0-9.+-]{1,48}$/, 48),
                'ROLLBACK_VERSION', errors);

        if (object(manifest.provenance, ['sourceCommit', 'assetSha256', 'signature', 'signer'],
            'PROVENANCE', errors)) {
            var provenance = manifest.provenance;
            requireThat(nullableString(provenance.sourceCommit, /^[a-f0-9]{40}$/, 40), 'SOURCE_COMMIT', errors);
            requireThat(nullableString(provenance.assetSha256, /^[a-f0-9]{64}$/, 64), 'ASSET_HASH', errors);
            requireThat(provenance.signature === null && provenance.signer === null,
                'SIGNATURE_UNSUPPORTED', errors);
        }
        var uniqueErrors = [];
        for (var i = 0; i < errors.length; i++)
            if (uniqueErrors.indexOf(errors[i]) < 0) uniqueErrors.push(errors[i]);
        uniqueErrors.sort();
        return uniqueErrors;
    }

    // The parsed value is intentionally discarded; callers receive codes only.
    function parseDraft(raw) {
        if (typeof raw !== 'string') return {valid:false, errors:['INPUT_TEXT_REQUIRED']};
        if (raw.length > 65536) return {valid:false, errors:['INPUT_TOO_LARGE']};
        var parsed;
        try { parsed = JSON.parse(raw); }
        catch (_) { return {valid:false, errors:['JSON_INVALID']}; }
        var errors = validateDraft(parsed);
        return {valid:errors.length === 0, errors:errors};
    }

    return {schemaId:SCHEMA_ID, validateDraft:validateDraft, parseDraft:parseDraft};
})();
if (typeof module !== 'undefined' && module.exports) {
    if (typeof VisualLoop !== 'undefined') module.exports.SkillContract = SkillContract;
    else module.exports = SkillContract;
}
