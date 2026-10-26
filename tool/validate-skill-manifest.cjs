'use strict';
// Command-line wrapper around the same draft-only validator shipped in the JS bundle.
const fs = require('node:fs');
const SkillContract = require('../src/skill-contract.js');

if (require.main === module) {
    if (process.argv.length !== 3) {
        process.stderr.write('Usage: node tool/validate-skill-manifest.cjs <manifest.json>\n');
        process.exitCode = 2;
    } else {
        try {
            const result = SkillContract.parseDraft(fs.readFileSync(process.argv[2], 'utf8'));
            if (result.valid) process.stdout.write('VALID: draft contract only; no load or execution API\n');
            else {
                process.stderr.write('INVALID: ' + result.errors.join(', ') + '\n');
                process.exitCode = 1;
            }
        } catch (_) {
            process.stderr.write('INVALID: INPUT_UNREADABLE\n');
            process.exitCode = 1;
        }
    }
}
module.exports = SkillContract;
