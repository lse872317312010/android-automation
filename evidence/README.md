# Redmi acceptance records

There is no physical-device evidence in this directory. The checked-in JSON is a
**synthetic, pending template**, deliberately rejected by the validator.

Run each scenario on the exact reviewed script; stop a prior run and relaunch
before the next scenario. Record only the fields permitted by the template.
Copy runId/mode/status/reason/actionCount/deviceValidation from that run's exported
report; use `verificationFrames: 0` and `reason: null` when absent. Do not replace
observed values with expected values to make validation pass.

| Scenario | How to observe | Required observation |
| --- | --- | --- |
| fixture | Authorize full-screen capture, leave selftest page untouched | One injected tap; nonce postcondition confirmed twice; no manual target tap |
| capture_denied | Decline screen capture during selftest | Blocked, no input |
| shizuku_denied | Revoke AutoJs6's Shizuku authorization, launch selftest | Blocked, no input; restore authorization afterwards |
| foreground_switch | Leave selftest before input is requested | FOREGROUND_CHANGED, no input |
| rotation | Change display rotation after capture while selftest is pending | ROTATION_CHANGED, no input; if portrait lock/OEM prevents this, leave pending and record a blocker outside the record |
| stop | Press Stop while selftest is pending | Cancelled, no input |
| cold_restart | Terminate a pending selftest before input, relaunch script | Previous run becomes interrupted, never completed or automatically resumed |
| starrail_read_only | Run the read-only button, switch to Star Rail in countdown | Observed, zero input; does not establish a working game task |

Set `observedInputCount` from human observation, not from `actionCount`:
`actionCount: 1` records intent and can coexist with zero delivered commands.
For the negative scenarios, intervene before injection. Once the OS has received
a tap, it cannot be recalled; such a run cannot satisfy a zero-input scenario.

Bind the record to the actual checkout and installed script:

```sh
git rev-parse HEAD
sha256sum dist/AndroidAutomation.js
node tool/validate-acceptance.cjs /path/to/record.json COMMIT_SHA dist/AndroidAutomation.js
```

The CLI returns nonzero with fixed error codes for pending/synthetic, wrong
commit/hash, missing/reused cases, inconsistent outcome or extra fields. Valid
records return **ready_for_review**, never a production promotion. This is a
local consistency check of operator assertions, **not attestation of hardware
truth**, a signature, or proof that a run happened. A reviewer must inspect the
actual test and result. The current runtime does not embed source/hash metadata;
the operator must verify that the installed script matches the hash. Keep this
limitation until a signed artifact-to-run binding is implemented.

Do not commit raw report dumps, screenshots, OCR text, serial numbers, account
identifiers or dumpsys output. Reports may include additional platform fields;
copy only the exact allowlisted projection into acceptance records. Keep real
records locally until review and any required sharing authorization.

Emulator and Node VM output cannot be labeled physical_redmi. The format only
covers the eight smoke scenarios, not full Shizuku lifecycle, power, games or
production acceptance. T3 emulator tests and T5 live single-step validation remain
separate gates. A missing physical device is a blocker, never an automatic pass.
