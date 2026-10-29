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


test('draft registry accepts distinct skills while remaining non-activating', () => {
    const second = copy(example);
    second.skill.id = 'starrail.daily_claim';
    const result = SkillContract.validateDraftRegistry([example, second]);
    assert.deepEqual(result, {
        status:'valid_draft_registry',activationAllowed:false,count:2,issues:[]
    });
    const historical = copy(example);
    historical.skill.version = '0.0.1-draft';
    assert.equal(SkillContract.validateDraftRegistry([example, historical]).status,
        'valid_draft_registry');
});

test('draft registry rejects duplicate versions and invalid entries without echoing data', () => {
    const duplicate = SkillContract.validateDraftRegistry([example, copy(example)]);
    assert.equal(duplicate.status, 'rejected');
    assert.equal(duplicate.activationAllowed, false);
    assert.deepEqual(duplicate.issues, [{index:1,codes:['DUPLICATE_SKILL_VERSION']}]);

    const invalid = copy(example);
    invalid.skill.executionEnabled = true;
    invalid.skill.description = 'PRIVATE_REGISTRY_VALUE';
    const rejected = SkillContract.validateDraftRegistry([example, invalid]);
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.activationAllowed, false);
    assert.equal(rejected.issues[0].index, 1);
    assert.ok(rejected.issues[0].codes.includes('EXECUTION_DISABLED'));
    assert.equal(JSON.stringify(rejected).includes('PRIVATE_REGISTRY_VALUE'), false);
});

test('draft registry rejects missing, empty, and oversized catalogs', () => {
    assert.deepEqual(SkillContract.validateDraftRegistry(null), {
        status:'rejected',activationAllowed:false,count:0,
        issues:[{index:null,codes:['REGISTRY_ARRAY_REQUIRED']}]
    });
    assert.deepEqual(SkillContract.validateDraftRegistry([]), {
        status:'rejected',activationAllowed:false,count:0,
        issues:[{index:null,codes:['REGISTRY_EMPTY']}]
    });
    const oversized = Array.from({length:33}, () => copy(example));
    const result = SkillContract.validateDraftRegistry(oversized);
    assert.equal(result.status, 'rejected');
    assert.equal(result.count, 33);
    assert.deepEqual(result.issues, [{index:null,codes:['REGISTRY_TOO_LARGE']}]);
});


test('draft registry rollback references resolve only within the same Skill history', () => {
    const older = copy(example);
    const candidate = copy(example);
    candidate.skill.version = '0.0.1-draft';
    candidate.rollback.lastKnownGoodVersion = older.skill.version;
    const valid = SkillContract.validateDraftRegistry([older, candidate]);
    assert.deepEqual(valid, {
        status:'valid_draft_registry',activationAllowed:false,count:2,issues:[]
    });

    const missing = copy(candidate);
    missing.rollback.lastKnownGoodVersion = '9.9.9-draft';
    const missingResult = SkillContract.validateDraftRegistry([older, missing]);
    assert.deepEqual(missingResult.issues, [{index:1,codes:['ROLLBACK_TARGET_NOT_FOUND']}]);

    const otherSkill = copy(older);
    otherSkill.skill.id = 'starrail.other_skill';
    const mismatched = copy(candidate);
    mismatched.rollback.lastKnownGoodVersion = older.skill.version;
    const mismatchedResult = SkillContract.validateDraftRegistry([otherSkill, mismatched]);
    assert.deepEqual(mismatchedResult.issues, [{index:1,codes:['ROLLBACK_TARGET_NOT_FOUND']}]);
});

test('draft registry rejects self-referential and cyclic rollback histories', () => {
    const self = copy(example);
    self.rollback.lastKnownGoodVersion = self.skill.version;
    assert.deepEqual(SkillContract.validateDraftRegistry([self]).issues,
        [{index:0,codes:['ROLLBACK_SELF_REFERENCE']}]);

    const older = copy(example);
    const newer = copy(example);
    newer.skill.version = '0.0.1-draft';
    older.rollback.lastKnownGoodVersion = newer.skill.version;
    newer.rollback.lastKnownGoodVersion = older.skill.version;
    const cycle = SkillContract.validateDraftRegistry([older, newer]);
    assert.equal(cycle.status, 'rejected');
    assert.equal(cycle.activationAllowed, false);
    assert.deepEqual(cycle.issues, [
        {index:0,codes:['ROLLBACK_CYCLE']},
        {index:1,codes:['ROLLBACK_CYCLE']}
    ]);
    assert.equal(JSON.stringify(cycle).includes(older.skill.id), false);

    const leading = copy(example);
    const cycleTarget = copy(example);
    const cycleSource = copy(example);
    leading.skill.version = '0.0.2-draft';
    leading.rollback.lastKnownGoodVersion = '0.0.1-draft';
    cycleTarget.skill.version = '0.0.1-draft';
    cycleTarget.rollback.lastKnownGoodVersion = '0.0.0-draft';
    cycleSource.rollback.lastKnownGoodVersion = '0.0.1-draft';
    const leadingCycle = SkillContract.validateDraftRegistry([leading, cycleTarget, cycleSource]);
    assert.deepEqual(leadingCycle.issues, [
        {index:1,codes:['ROLLBACK_CYCLE']},
        {index:2,codes:['ROLLBACK_CYCLE']}
    ]);
});


test('registry compatibility assessment reports a unique review-only version', () => {
    const older = compatibleManifest();
    const newer = compatibleManifest();
    newer.skill.version = '0.0.1-draft';
    newer.rollback.lastKnownGoodVersion = older.skill.version;
    newer.compatibility.apkVersionCode = {min:'200',max:'300'};
    const result = SkillContract.assessDraftRegistryCompatibility(
        [older,newer], {gameId:older.skill.gameId,skillId:older.skill.id}, compatibilityContext());
    assert.equal(result.status, 'compatible_for_fixture_review');
    assert.equal(result.activationAllowed, false);
    assert.equal(result.matchCount, 1);
    assert.deepEqual(result.assessments.map(x=>x.index), [0,1]);
    assert.equal(result.assessments[0].status, 'compatible_for_fixture_review');
    assert.ok(result.assessments[1].reasons.includes('APK_VERSION_OUT_OF_RANGE'));
    assert.deepEqual(result.issues, []);
});

test('registry compatibility assessment blocks ambiguous and absent compatible versions', () => {
    const first = compatibleManifest();
    const second = compatibleManifest();
    second.skill.version = '0.0.1-draft';
    second.rollback.lastKnownGoodVersion = first.skill.version;
    const request = {gameId:first.skill.gameId,skillId:first.skill.id};

    const ambiguous = SkillContract.assessDraftRegistryCompatibility(
        [first,second], request, compatibilityContext());
    assert.equal(ambiguous.status, 'blocked');
    assert.equal(ambiguous.activationAllowed, false);
    assert.equal(ambiguous.matchCount, 2);
    assert.deepEqual(ambiguous.issues,
        [{index:null,codes:['AMBIGUOUS_COMPATIBLE_VERSIONS']}]);

    const noMatch = SkillContract.assessDraftRegistryCompatibility(
        [first,second], request, Object.assign(compatibilityContext(), {locale:'en-US'}));
    assert.equal(noMatch.status, 'blocked');
    assert.equal(noMatch.activationAllowed, false);
    assert.equal(noMatch.matchCount, 0);
    assert.deepEqual(noMatch.issues, [{index:null,codes:['NO_COMPATIBLE_VERSION']}]);
    assert.ok(noMatch.assessments.every(x=>x.reasons.includes('LOCALE_MISMATCH')));
});

test('registry compatibility assessment rejects invalid requests, contexts and catalogs without echoing', () => {
    const manifest = compatibleManifest();
    const request = {gameId:manifest.skill.gameId,skillId:manifest.skill.id};
    const invalidRequest = SkillContract.assessDraftRegistryCompatibility(
        [manifest], {gameId:'PRIVATE_GAME',skillId:manifest.skill.id,secret:'PRIVATE_VALUE'},
        compatibilityContext());
    assert.equal(invalidRequest.status, 'blocked');
    assert.equal(invalidRequest.activationAllowed, false);
    assert.ok(invalidRequest.issues[0].codes.includes('REQUESTED_IDENTITY_SHAPE_FIELDS'));
    assert.equal(JSON.stringify(invalidRequest).includes('PRIVATE'), false);

    const missing = SkillContract.assessDraftRegistryCompatibility(
        [manifest], {gameId:'other-game',skillId:manifest.skill.id}, compatibilityContext());
    assert.ok(missing.issues[0].codes.includes('SKILL_NOT_FOUND'));

    const malformedContext = Object.assign(compatibilityContext(), {token:'PRIVATE_CONTEXT'});
    const blockedContext = SkillContract.assessDraftRegistryCompatibility([manifest], request, malformedContext);
    assert.ok(blockedContext.issues[0].codes.includes('CONTEXT_SHAPE_FIELDS'));
    assert.equal(JSON.stringify(blockedContext).includes('PRIVATE_CONTEXT'), false);

    const invalidCatalog = SkillContract.assessDraftRegistryCompatibility(
        [manifest,copy(manifest)],request,compatibilityContext());
    assert.equal(invalidCatalog.status, 'rejected');
    assert.equal(invalidCatalog.activationAllowed, false);
    assert.ok(invalidCatalog.issues[0].codes.includes('DUPLICATE_SKILL_VERSION'));
});

test('rollback compatibility assessment reviews the registered target without activating it', () => {
    const knownGood = compatibleManifest();
    knownGood.skill.version = '0.1.0-draft';
    const failing = compatibleManifest();
    failing.skill.version = '0.2.0-draft';
    failing.rollback.lastKnownGoodVersion = knownGood.skill.version;
    const result = SkillContract.assessDraftRollbackCompatibility(
        [knownGood,failing],
        {gameId:failing.skill.gameId,skillId:failing.skill.id,failingVersion:failing.skill.version},
        compatibilityContext());

    assert.equal(result.status, 'compatible_for_fixture_review');
    assert.equal(result.activationAllowed, false);
    assert.equal(result.failingIndex, 1);
    assert.equal(result.rollbackIndex, 0);
    assert.equal(result.targetVersion, knownGood.skill.version);
    assert.equal(result.targetCompatibility.status, 'compatible_for_fixture_review');
    assert.ok(result.targetCompatibility.reasons.includes('DEVICE_VALIDATION_REQUIRED'));
    assert.deepEqual(result.issues, []);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'manifest'), false);
});

test('rollback compatibility blocks a declared target that mismatches the caller context', () => {
    const knownGood = compatibleManifest();
    knownGood.skill.version = '0.1.0-draft';
    knownGood.compatibility.packages = ['com.example.othergame'];
    const failing = compatibleManifest();
    failing.skill.version = '0.2.0-draft';
    failing.rollback.lastKnownGoodVersion = knownGood.skill.version;
    const result = SkillContract.assessDraftRollbackCompatibility(
        [knownGood,failing],
        {gameId:failing.skill.gameId,skillId:failing.skill.id,failingVersion:failing.skill.version},
        compatibilityContext());

    assert.equal(result.status, 'blocked');
    assert.equal(result.activationAllowed, false);
    assert.equal(result.rollbackIndex, 0);
    assert.equal(result.targetCompatibility.status, 'blocked');
    assert.ok(result.targetCompatibility.reasons.includes('PACKAGE_MISMATCH'));
    assert.deepEqual(result.issues, [{index:0,codes:['ROLLBACK_TARGET_INCOMPATIBLE']}]);
});

test('rollback compatibility blocks missing targets and malformed private input', () => {
    const manifest = compatibleManifest();
    const request = {gameId:manifest.skill.gameId,skillId:manifest.skill.id,failingVersion:manifest.skill.version};
    const unconfigured = SkillContract.assessDraftRollbackCompatibility([manifest],request,compatibilityContext());
    assert.equal(unconfigured.status, 'blocked');
    assert.equal(unconfigured.activationAllowed, false);
    assert.ok(unconfigured.issues[0].codes.includes('ROLLBACK_TARGET_NOT_CONFIGURED'));

    const missing = SkillContract.assessDraftRollbackCompatibility([manifest],
        {gameId:manifest.skill.gameId,skillId:manifest.skill.id,failingVersion:'9.9.9-draft'},
        compatibilityContext());
    assert.ok(missing.issues[0].codes.includes('SKILL_VERSION_NOT_FOUND'));

    const malformedRequest = SkillContract.assessDraftRollbackCompatibility([manifest],
        {gameId:manifest.skill.gameId,skillId:manifest.skill.id,failingVersion:manifest.skill.version,secret:'PRIVATE_REQUEST'},
        compatibilityContext());
    assert.equal(malformedRequest.status, 'blocked');
    assert.ok(malformedRequest.issues[0].codes.includes('ROLLBACK_REQUEST_SHAPE_FIELDS'));
    assert.equal(JSON.stringify(malformedRequest).includes('PRIVATE_REQUEST'), false);

    const malformedContext = Object.assign(compatibilityContext(), {token:'PRIVATE_CONTEXT'});
    const blockedContext = SkillContract.assessDraftRollbackCompatibility([manifest],request,malformedContext);
    assert.ok(blockedContext.issues[0].codes.includes('CONTEXT_SHAPE_FIELDS'));
    assert.equal(JSON.stringify(blockedContext).includes('PRIVATE_CONTEXT'), false);
});
