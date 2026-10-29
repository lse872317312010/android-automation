/* Draft Skill contract only. No loader, executor, filesystem access or promotion API. */
var SkillContract = (function () {
    var SCHEMA_ID = 'android-automation.skill.v0.draft';
    var CAPABILITIES = ['capture.fullscreen', 'recognize.ocr', 'act.tap', 'verify.semantic'];
    var ENGINES = ['maafw', 'autojs6-shizuku'];
    var ROOT_KEYS = ['$comment', 'schema', 'skill', 'compatibility', 'execution',
        'verification', 'promotion', 'rollback', 'provenance'];
    var MAX_REGISTRY_ENTRIES = 32;

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

    function dottedVersion(value) {
        return string(value, /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*)){1,3}$/, 3, 64);
    }
    function compareDottedVersions(a, b) {
        var left = a.split('.'), right = b.split('.'), count = Math.max(left.length, right.length);
        for (var i = 0; i < count; i++) {
            var x = left[i] || '0', y = right[i] || '0', order = versionCompare(x, y);
            if (order !== 0) return order;
        }
        return 0;
    }
    function cleanCodes(codes) {
        var result = [];
        for (var i = 0; i < codes.length; i++)
            if (result.indexOf(codes[i]) < 0) result.push(codes[i]);
        result.sort();
        return result;
    }
    // Field-level metadata diagnostics are stable codes; caller values are never returned.
    function validateCompatibilityContext(context) {
        var errors = [];
        var packagePattern = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
        var localePattern = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
        var digitVersion = /^(0|[1-9]\d{0,29})$/;
        if (!object(context, ['packageName', 'locale', 'apkVersionCode', 'engine', 'capabilities', 'ui'],
            'CONTEXT_SHAPE', errors)) return cleanCodes(errors);
        requireThat(string(context.packageName, packagePattern, 3, 160), 'CONTEXT_PACKAGE_NAME', errors);
        requireThat(string(context.locale, localePattern, 2, 35), 'CONTEXT_LOCALE', errors);
        requireThat(context.apkVersionCode === null ||
            string(context.apkVersionCode, digitVersion, 1, 30), 'CONTEXT_APK_VERSION_CODE', errors);

        if (object(context.engine, ['id', 'version'], 'CONTEXT_ENGINE_SHAPE', errors)) {
            requireThat(string(context.engine.id, /^[a-z][a-z0-9-]{1,31}$/, 2, 32) &&
                ENGINES.indexOf(context.engine.id) >= 0, 'CONTEXT_ENGINE_ID', errors);
            requireThat(context.engine.version === null || dottedVersion(context.engine.version),
                'CONTEXT_ENGINE_VERSION', errors);
        }
        requireThat(Array.isArray(context.capabilities) && context.capabilities.length <= CAPABILITIES.length &&
            context.capabilities.every(function (x) { return CAPABILITIES.indexOf(x) >= 0; }) &&
            unique(context.capabilities), 'CONTEXT_CAPABILITIES', errors);

        if (object(context.ui, ['profile', 'anchors'], 'CONTEXT_UI_SHAPE', errors)) {
            requireThat(context.ui.profile === null || string(context.ui.profile, null, 1, 96),
                'CONTEXT_UI_PROFILE', errors);
            requireThat(Array.isArray(context.ui.anchors) && context.ui.anchors.length <= 32 &&
                context.ui.anchors.every(function (x) { return string(x, null, 1, 96); }) &&
                unique(context.ui.anchors), 'CONTEXT_UI_ANCHORS', errors);
        }
        return cleanCodes(errors);
    }

    // This compares caller-supplied metadata only. It is never device attestation or activation.
    function evaluateCompatibility(manifest, context) {
        var manifestErrors = validateDraft(manifest);
        if (manifestErrors.length)
            return {status:'rejected', activationAllowed:false, reasons:manifestErrors};
        var contextErrors = validateCompatibilityContext(context);
        if (contextErrors.length)
            return {status:'blocked', activationAllowed:false, reasons:contextErrors};

        var reasons = [], c = manifest.compatibility;
        if (c.packages.indexOf(context.packageName) < 0) reasons.push('PACKAGE_MISMATCH');
        if (c.locale !== context.locale) reasons.push('LOCALE_MISMATCH');

        if (c.apkVersionCode.min === null || c.apkVersionCode.max === null)
            reasons.push('APK_VERSION_RANGE_UNPINNED');
        else if (context.apkVersionCode === null)
            reasons.push('APK_VERSION_UNKNOWN');
        else if (versionCompare(context.apkVersionCode, c.apkVersionCode.min) < 0 ||
            versionCompare(context.apkVersionCode, c.apkVersionCode.max) > 0)
            reasons.push('APK_VERSION_OUT_OF_RANGE');

        if (c.engine.id !== context.engine.id) reasons.push('ENGINE_MISMATCH');
        if (c.engine.minVersion === null) reasons.push('ENGINE_VERSION_UNPINNED');
        else if (!dottedVersion(c.engine.minVersion)) reasons.push('ENGINE_VERSION_UNSUPPORTED');
        else if (context.engine.version === null) reasons.push('ENGINE_VERSION_UNKNOWN');
        else if (compareDottedVersions(context.engine.version, c.engine.minVersion) < 0)
            reasons.push('ENGINE_VERSION_TOO_OLD');

        if (c.uiSignature.profile === null) reasons.push('UI_PROFILE_UNPINNED');
        else if (context.ui.profile === null) reasons.push('UI_PROFILE_UNKNOWN');
        else if (c.uiSignature.profile !== context.ui.profile) reasons.push('UI_PROFILE_MISMATCH');
        if (!c.uiSignature.requiredAnchors.length) reasons.push('UI_ANCHORS_UNSPECIFIED');
        else if (!c.uiSignature.requiredAnchors.every(function (anchor) {
            return context.ui.anchors.indexOf(anchor) >= 0;
        })) reasons.push('UI_ANCHORS_MISSING');

        if (!c.requiredCapabilities.every(function (capability) {
            return context.capabilities.indexOf(capability) >= 0;
        })) reasons.push('CAPABILITY_MISSING');

        reasons = cleanCodes(reasons);
        if (reasons.length) return {status:'blocked', activationAllowed:false, reasons:reasons};
        return {status:'compatible_for_fixture_review', activationAllowed:false,
            reasons:['DEVICE_VALIDATION_REQUIRED','DRAFT_ONLY','EXECUTOR_NOT_IMPLEMENTED','SIGNATURE_UNSUPPORTED']};
    }

    // Validate an in-memory draft catalog only. This never installs or activates entries.
    function validateDraftRegistry(manifests) {
        var issues = [], count = Array.isArray(manifests) ? manifests.length : 0;
        if (!Array.isArray(manifests))
            issues.push({index:null,codes:['REGISTRY_ARRAY_REQUIRED']});
        else if (manifests.length === 0)
            issues.push({index:null,codes:['REGISTRY_EMPTY']});
        else if (manifests.length > MAX_REGISTRY_ENTRIES)
            issues.push({index:null,codes:['REGISTRY_TOO_LARGE']});
        else {
            var identities = [];
            for (var i = 0; i < manifests.length; i++) {
                var errors = validateDraft(manifests[i]);
                if (errors.length) {
                    issues.push({index:i,codes:errors});
                    continue;
                }
                var skill = manifests[i].skill;
                var identity = JSON.stringify([skill.gameId, skill.id, skill.version]);
                if (identities.indexOf(identity) >= 0)
                    issues.push({index:i,codes:['DUPLICATE_SKILL_VERSION']});
                else identities.push(identity);
            }

            // Resolve rollback references only after every draft and identity is unambiguous.
            if (!issues.length) {
                var edges = [];
                for (var edgeIndex = 0; edgeIndex < manifests.length; edgeIndex++) edges.push(-1);
                for (var current = 0; current < manifests.length; current++) {
                    var entry = manifests[current], rollbackVersion = entry.rollback.lastKnownGoodVersion;
                    if (rollbackVersion === null) continue;
                    if (rollbackVersion === entry.skill.version) {
                        issues.push({index:current,codes:['ROLLBACK_SELF_REFERENCE']});
                        continue;
                    }
                    var target = -1;
                    for (var candidate = 0; candidate < manifests.length; candidate++) {
                        var targetSkill = manifests[candidate].skill;
                        if (targetSkill.gameId === entry.skill.gameId &&
                            targetSkill.id === entry.skill.id && targetSkill.version === rollbackVersion) {
                            target = candidate;
                            break;
                        }
                    }
                    if (target < 0)
                        issues.push({index:current,codes:['ROLLBACK_TARGET_NOT_FOUND']});
                    else edges[current] = target;
                }

                var state = [], stack = [];
                for (var stateIndex = 0; stateIndex < manifests.length; stateIndex++) state.push(0);
                var visit = function (index) {
                    if (state[index] === 2) return;
                    if (state[index] === 1) {
                        var cycleStart = stack.indexOf(index);
                        for (var member = cycleStart; member < stack.length; member++)
                            issues.push({index:stack[member],codes:['ROLLBACK_CYCLE']});
                        return;
                    }
                    state[index] = 1;
                    stack.push(index);
                    if (edges[index] >= 0) visit(edges[index]);
                    stack.pop();
                    state[index] = 2;
                };
                for (var visitIndex = 0; visitIndex < manifests.length; visitIndex++)
                    if (state[visitIndex] === 0) visit(visitIndex);
                issues.sort(function (a, b) { return a.index - b.index; });
            }
        }
        return {status:issues.length ? 'rejected' : 'valid_draft_registry',
            activationAllowed:false,count:count,issues:issues};
    }

    // Assess one requested Skill across draft versions without choosing or loading one.
    function assessDraftRegistryCompatibility(manifests, requested, context) {
        var registry = validateDraftRegistry(manifests);
        if (registry.status !== 'valid_draft_registry')
            return {status:'rejected',activationAllowed:false,matchCount:0,assessments:[],issues:registry.issues};

        var identityErrors = [];
        if (!object(requested, ['gameId', 'skillId'], 'REQUESTED_IDENTITY_SHAPE', identityErrors))
            return {status:'blocked',activationAllowed:false,matchCount:0,assessments:[],
                issues:[{index:null,codes:cleanCodes(identityErrors)}]};
        requireThat(string(requested.gameId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 2, 64),
            'REQUESTED_GAME_ID', identityErrors);
        requireThat(string(requested.skillId, /^[a-z][a-z0-9]*(?:\.[a-z0-9]+(?:[_-][a-z0-9]+)*)+$/, 3, 96),
            'REQUESTED_SKILL_ID', identityErrors);
        identityErrors = cleanCodes(identityErrors);
        if (identityErrors.length)
            return {status:'blocked',activationAllowed:false,matchCount:0,assessments:[],
                issues:[{index:null,codes:identityErrors}]};

        var contextErrors = validateCompatibilityContext(context);
        if (contextErrors.length)
            return {status:'blocked',activationAllowed:false,matchCount:0,assessments:[],
                issues:[{index:null,codes:contextErrors}]};

        var targetIndexes = [];
        for (var i = 0; i < manifests.length; i++)
            if (manifests[i].skill.gameId === requested.gameId &&
                manifests[i].skill.id === requested.skillId) targetIndexes.push(i);
        if (!targetIndexes.length)
            return {status:'blocked',activationAllowed:false,matchCount:0,assessments:[],
                issues:[{index:null,codes:['SKILL_NOT_FOUND']}]};

        var assessments = [], matchCount = 0;
        for (var targetIndex = 0; targetIndex < targetIndexes.length; targetIndex++) {
            var index = targetIndexes[targetIndex];
            var result = evaluateCompatibility(manifests[index], context);
            assessments.push({index:index,status:result.status,reasons:result.reasons});
            if (result.status === 'compatible_for_fixture_review') matchCount++;
        }
        if (matchCount === 1)
            return {status:'compatible_for_fixture_review',activationAllowed:false,
                matchCount:matchCount,assessments:assessments,issues:[]};
        if (matchCount > 1)
            return {status:'blocked',activationAllowed:false,matchCount:matchCount,
                assessments:assessments,issues:[{index:null,codes:['AMBIGUOUS_COMPATIBLE_VERSIONS']}]};
        return {status:'blocked',activationAllowed:false,matchCount:0,assessments:assessments,
            issues:[{index:null,codes:['NO_COMPATIBLE_VERSION']}]};
    }

    return {schemaId:SCHEMA_ID, validateDraft:validateDraft, parseDraft:parseDraft,
        validateCompatibilityContext:validateCompatibilityContext,
        evaluateCompatibility:evaluateCompatibility, validateDraftRegistry:validateDraftRegistry,
        assessDraftRegistryCompatibility:assessDraftRegistryCompatibility};
})();
if (typeof module !== 'undefined' && module.exports) {
    if (typeof VisualLoop !== 'undefined') module.exports.SkillContract = SkillContract;
    else module.exports = SkillContract;
}
