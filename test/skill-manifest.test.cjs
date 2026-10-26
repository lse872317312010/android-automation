'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../schemas/skill-manifest.v0.draft.schema.json');
const example = require('../examples/starrail-skill-manifest.example.json');
const SkillContract = require('../src/skill-contract.js');

function copy(value) { return JSON.parse(JSON.stringify(value)); }

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
        assert.ok(SkillContract.validateDraft(mutate(copy(example))).includes(code), code);
});

test('unknown capabilities and malformed or duplicated compatibility entries fail closed', () => {
    const cases = [
        [m => {m.compatibility.requiredCapabilities.push('act.shell');}, 'CAPABILITIES'],
        [m => {m.compatibility.packages.push(m.compatibility.packages[0]);}, 'PACKAGES'],
        [m => {m.compatibility.requiredCapabilities.push('act.tap');}, 'CAPABILITIES'],
        [m => {m.compatibility.packages[0] = 'com.example..game';}, 'PACKAGES']
    ];
    for (const [mutate, code] of cases)
        assert.ok(SkillContract.validateDraft(mutate(copy(example))).includes(code), code);
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
        assert.ok(SkillContract.validateDraft(mutate(copy(example))).includes(code), code);
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
