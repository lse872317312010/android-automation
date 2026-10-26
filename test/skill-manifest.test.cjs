'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../schemas/skill-manifest.v0.draft.schema.json');
const example = require('../examples/starrail-skill-manifest.example.json');
const SkillContract = require('../src/skill-contract.js');

function copy(value) { return JSON.parse(JSON.stringify(value)); }
function changed(mutate) { const value=copy(example); mutate(value); return value; }

test('example validates as a draft and parser returns no loadable manifest', () => {
    assert.deepEqual(SkillContract.validateDraft(example), []);
    const result = SkillContract.parseDraft(JSON.stringify(example));
    assert.deepEqual(result, {valid:true, errors:[]});
    assert.deepEqual(Object.keys(result).sort(), ['errors', 'valid']);
    assert.equal(example.skill.executionEnabled, false);
    assert.equal(example.execution.inputBudget.maxActions, 0);
    assert.equal(schema.properties.schema.const, SkillContract.schemaId);
    assert.equal(schema.properties.skill.properties.executionEnabled.const, false);
    assert.ok(new RegExp(schema.properties.skill.properties.id.pattern).test(example.skill.id));
    assert.ok(new RegExp(schema.properties.skill.properties.version.pattern).test(example.skill.version));
});

test('activation, action budget and executable workflow are rejected', () => {
    const cases = [
        [m => {m.skill.executionEnabled = true;}, 'EXECUTION_DISABLED'],
        [m => {m.skill.status = 'active';}, 'SKILL_STATUS'],
        [m => {m.execution.inputBudget.maxActions = 1;}, 'ACTION_BUDGET'],
        [m => {m.execution.inputBudget.maxRetries = 1;}, 'RETRY_BUDGET'],
        [m => {m.execution.workflowPath = 'steps.json';}, 'WORKFLOW_DISABLED'],
        [m => {m.execution.unknownState = 'continue';}, 'UNKNOWN_STATE']
    ];
    for (const [mutate, code] of cases)
        assert.ok(SkillContract.validateDraft(changed(mutate)).includes(code), code);
});

test('unknown capabilities and malformed or duplicated compatibility entries fail closed', () => {
    const cases = [
        [m => {m.compatibility.requiredCapabilities.push('act.shell');}, 'CAPABILITIES'],
        [m => {m.compatibility.packages.push(m.compatibility.packages[0]);}, 'PACKAGES'],
        [m => {m.compatibility.requiredCapabilities.push('act.tap');}, 'CAPABILITIES'],
        [m => {m.compatibility.packages[0] = 'com.example..game';}, 'PACKAGES']
    ];
    for (const [mutate, code] of cases)
        assert.ok(SkillContract.validateDraft(changed(mutate)).includes(code), code);
});

test('version ranges and provenance cannot imply unsupported trust', () => {
    const cases = [
        [m => {m.compatibility.apkVersionCode.min = '10';}, 'VERSION_RANGE'],
        [m => {m.compatibility.apkVersionCode.min = '12';m.compatibility.apkVersionCode.max = '11';}, 'VERSION_RANGE_ORDER'],
        [m => {m.provenance.sourceCommit = 'abc';}, 'SOURCE_COMMIT'],
        [m => {m.provenance.signature = 'signed';}, 'SIGNATURE_UNSUPPORTED'],
        [m => {m.promotion.verifiedOnDevice = true;}, 'PROMOTION_GATE']
    ];
    for (const [mutate, code] of cases)
        assert.ok(SkillContract.validateDraft(changed(mutate)).includes(code), code);
});

test('unknown fields and malformed shapes are rejected without echoing user data', () => {
    const injected = copy(example);
    injected.executor = 'PRIVATE_PAYLOAD';
    assert.ok(SkillContract.validateDraft(injected).includes('MANIFEST_FIELDS'));
    const bad = SkillContract.parseDraft('{"private":"SECRET"');
    assert.deepEqual(bad, {valid:false, errors:['JSON_INVALID']});
    assert.equal(JSON.stringify(bad).includes('SECRET'), false);
    const oversized = SkillContract.parseDraft(JSON.stringify({data:'x'.repeat(70000)}));
    assert.deepEqual(oversized, {valid:false, errors:['INPUT_TOO_LARGE']});
    assert.deepEqual(SkillContract.parseDraft(null), {valid:false, errors:['INPUT_TEXT_REQUIRED']});
});

test('draft metadata is bounded and unsupported engine aliases fail', () => {
    const invalid = copy(example);
    invalid.verification.successCondition = 'x'.repeat(513);
    invalid.compatibility.engine.id = 'exec';
    invalid.compatibility.uiSignature.requiredAnchors = ['menu'];
    invalid.compatibility.uiSignature.profile = null;
    invalid.skill.id = 'bad id';
    const errors = SkillContract.validateDraft(invalid);
    assert.ok(errors.includes('SUCCESS_CONDITION'));
    assert.ok(errors.includes('SKILL_ID'));
    assert.ok(errors.includes('ENGINE_ID'));
    assert.ok(errors.includes('UI_PROFILE_REQUIRED'));
});

function compatibleManifest() {
    const manifest = copy(example);
    manifest.compatibility.apkVersionCode = {min:'100', max:'200'};
    manifest.compatibility.uiSignature = {profile:'fixture-menu-v1',requiredAnchors:['menu.settings']};
    manifest.compatibility.engine.minVersion = '6.7.0';
    return manifest;
}
function compatibilityContext() {
    return {
        packageName:'com.miHoYo.hkrpg',
        locale:'zh-CN',
        apkVersionCode:'150',
        engine:{id:'maafw',version:'6.10.0'},
        capabilities:['capture.fullscreen','recognize.ocr','act.tap','verify.semantic'],
        ui:{profile:'fixture-menu-v1',anchors:['menu.settings']}
    };
}

test('matching metadata remains fixture-review only and can never activate', () => {
    const context = compatibilityContext();
    assert.deepEqual(SkillContract.validateCompatibilityContext(context), []);
    const result = SkillContract.evaluateCompatibility(compatibleManifest(), context);
    assert.equal(result.status, 'compatible_for_fixture_review');
    assert.equal(result.activationAllowed, false);
    assert.deepEqual(result.reasons,
        ['DEVICE_VALIDATION_REQUIRED','DRAFT_ONLY','EXECUTOR_NOT_IMPLEMENTED','SIGNATURE_UNSUPPORTED']);
    assert.deepEqual(Object.keys(result).sort(), ['activationAllowed','reasons','status']);
});

test('unknown or mismatched compatibility metadata fails closed', () => {
    const manifest = compatibleManifest();
    const mutations = [
        [c => {c.packageName='com.other.game';}, 'PACKAGE_MISMATCH'],
        [c => {c.locale='en-US';}, 'LOCALE_MISMATCH'],
        [c => {c.apkVersionCode=null;}, 'APK_VERSION_UNKNOWN'],
        [c => {c.apkVersionCode='201';}, 'APK_VERSION_OUT_OF_RANGE'],
        [c => {c.engine.version='6.6.9';}, 'ENGINE_VERSION_TOO_OLD'],
        [c => {c.engine.id='autojs6-shizuku';}, 'ENGINE_MISMATCH'],
        [c => {c.ui.profile='other-profile';}, 'UI_PROFILE_MISMATCH'],
        [c => {c.ui.anchors=[];}, 'UI_ANCHORS_MISSING'],
        [c => {c.capabilities.pop();}, 'CAPABILITY_MISSING']
    ];
    for (const [mutate, code] of mutations) {
        const context = compatibilityContext();
        mutate(context);
        const result = SkillContract.evaluateCompatibility(manifest, context);
        assert.equal(result.status, 'blocked', code);
        assert.equal(result.activationAllowed, false, code);
        assert.ok(result.reasons.includes(code), code);
    }
});

test('unpinned draft, malformed context and invalid manifest never become compatible', () => {
    const unpinned = SkillContract.evaluateCompatibility(example, compatibilityContext());
    assert.equal(unpinned.status, 'blocked');
    assert.ok(unpinned.reasons.includes('APK_VERSION_RANGE_UNPINNED'));
    assert.ok(unpinned.reasons.includes('ENGINE_VERSION_UNPINNED'));
    assert.ok(unpinned.reasons.includes('UI_PROFILE_UNPINNED'));

    const context = compatibilityContext();
    context.privateValue = 'SECRET';
    const malformed = SkillContract.evaluateCompatibility(compatibleManifest(), context);
    assert.deepEqual(malformed, {status:'blocked',activationAllowed:false,reasons:['CONTEXT_SHAPE_FIELDS']});
    assert.equal(JSON.stringify(malformed).includes('SECRET'), false);

    const active = compatibleManifest();
    active.skill.executionEnabled = true;
    const rejected = SkillContract.evaluateCompatibility(active, compatibilityContext());
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.activationAllowed, false);
    assert.ok(rejected.reasons.includes('EXECUTION_DISABLED'));
});


test('compatibility context diagnostics are field-specific, stable, and never echo values', () => {
    const cases = [
        [c => {c.packageName='PRIVATE_PACKAGE';}, 'CONTEXT_PACKAGE_NAME', 'PRIVATE_PACKAGE'],
        [c => {c.locale='PRIVATE_LOCALE';}, 'CONTEXT_LOCALE', 'PRIVATE_LOCALE'],
        [c => {c.apkVersionCode='PRIVATE_VERSION';}, 'CONTEXT_APK_VERSION_CODE', 'PRIVATE_VERSION'],
        [c => {c.engine.id='PRIVATE_ENGINE';}, 'CONTEXT_ENGINE_ID', 'PRIVATE_ENGINE'],
        [c => {c.engine.version='PRIVATE_VERSION';}, 'CONTEXT_ENGINE_VERSION', 'PRIVATE_VERSION'],
        [c => {c.capabilities.push('PRIVATE_CAPABILITY');}, 'CONTEXT_CAPABILITIES', 'PRIVATE_CAPABILITY'],
        [c => {c.ui.profile='';}, 'CONTEXT_UI_PROFILE', null],
        [c => {c.ui.anchors=['duplicate','duplicate'];}, 'CONTEXT_UI_ANCHORS', null],
        [c => {c.privateValue='SECRET_CONTEXT_VALUE';}, 'CONTEXT_SHAPE_FIELDS', 'SECRET_CONTEXT_VALUE']
    ];
    for (const [mutate, code, privateValue] of cases) {
        const context = compatibilityContext();
        mutate(context);
        const diagnostics = SkillContract.validateCompatibilityContext(context);
        assert.ok(diagnostics.includes(code), code);
        assert.deepEqual(diagnostics, diagnostics.slice().sort(), code);
        assert.equal(JSON.stringify(diagnostics).includes(privateValue || 'SECRET_CONTEXT_VALUE'), false, code);
        const result = SkillContract.evaluateCompatibility(compatibleManifest(), context);
        assert.equal(result.status, 'blocked', code);
        assert.equal(result.activationAllowed, false, code);
        assert.deepEqual(result.reasons, diagnostics, code);
    }
});
