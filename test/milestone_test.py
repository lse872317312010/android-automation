import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile

spec = importlib.util.spec_from_file_location("milestone", Path(__file__).resolve().parents[1] / "tool/verify-milestone.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MilestoneFixture:
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.pack = self.root / "milestone"
        self.pack.mkdir()
        self.commit = "a" * 40
        self.bundle = self.root / "source.js"
        self.bundle.write_bytes(b'"ui"; // synthetic source\n')
        self.make_package()

    def make_apk(self, script=None):
        # Structural fixtures are unsigned; signature validity is an independent SDK gate.
        with zipfile.ZipFile(self.pack / "AndroidAutomation-milestone.apk", "w") as apk:
            apk.writestr("AndroidManifest.xml", b"synthetic binary manifest")
            apk.writestr("classes.dex", b"synthetic dex")
            apk.writestr("assets/AndroidAutomation.js", self.bundle.read_bytes() if script is None else script)

    def make_package(self):
        self.make_apk()
        (self.pack / "AndroidAutomation.js").write_bytes(self.bundle.read_bytes())
        (self.pack / "COMMIT.txt").write_text(self.commit + "\n")
        (self.pack / "README.txt").write_text("Synthetic debug fixture; no hardware claim.\n")
        self.receipt = {"schema": "android-framework-contract.v1", "tier": "partial_T3_framework",
                        "visualLoop": "emulator_pixels_mlkit_portable_policy", "productionAdapterValidated": False,
                        "deviceValidation": "not_established", "commit": self.commit,
                        "scriptSha256": module.sha256(self.bundle), "emulatorApi": 30,
                        "testCount": module.NATIVE_COUNT, "status": "passed"}
        self.write_receipt()

    def seal(self):
        (self.pack / "SHA256SUMS").write_text("".join(
            module.sha256(self.pack / name) + "  " + name + "\n" for name in sorted(module.PAYLOAD)))

    def write_receipt(self):
        (self.pack / "android-framework.json").write_text(json.dumps(self.receipt))
        self.seal()

    def validate(self, expected=None):
        return module.validate(self.pack, self.commit, self.bundle, expected)


class MilestoneTests(MilestoneFixture, unittest.TestCase):
    def test_consistent_package_is_not_signature_or_device_attestation(self):
        report = self.validate()
        self.assertEqual(report["status"], "consistent")
        self.assertEqual(report["deviceValidation"], "not_established")
        self.assertEqual(report["signatureGate"], "separate_apksigner_check")

    def test_stale_embedded_script_with_valid_package_checksums_is_rejected(self):
        self.make_apk(b"older script")
        self.seal()
        with self.assertRaisesRegex(module.InvalidMilestone, "APK_SCRIPT_MISMATCH"):
            self.validate()

    def test_changed_export_cannot_rebind_to_a_different_source(self):
        (self.pack / "AndroidAutomation.js").write_bytes(b"changed script")
        self.receipt["scriptSha256"] = module.sha256(self.pack / "AndroidAutomation.js")
        self.write_receipt()
        with self.assertRaisesRegex(module.InvalidMilestone, "SOURCE_BUNDLE_MISMATCH"):
            self.validate()

    def test_wrong_commit_is_rejected_even_after_rehash(self):
        (self.pack / "COMMIT.txt").write_text("b" * 40 + "\n")
        self.seal()
        with self.assertRaisesRegex(module.InvalidMilestone, "COMMIT_MISMATCH"):
            self.validate()

    def test_receipt_scope_types_and_identity_cannot_be_promoted(self):
        changes = {"productionAdapterValidated": True, "deviceValidation": "device_verified",
                   "testCount": 0, "commit": "b" * 40, "emulatorApi": "30", "status": True,
                   "scriptSha256": "0" * 64, "tier": "physical_T4"}
        original = dict(self.receipt)
        for key, value in changes.items():
            with self.subTest(field=key):
                self.receipt = {**original, key: value}
                self.write_receipt()
                with self.assertRaises(module.InvalidMilestone):
                    self.validate()

    def test_unknown_or_duplicate_receipt_fields_are_rejected(self):
        self.receipt["unexpected"] = False
        self.write_receipt()
        with self.assertRaises(module.InvalidMilestone):
            self.validate()
        self.make_package()
        path = self.pack / "android-framework.json"
        path.write_text(path.read_text()[:-1] + ',"status":"passed"}')
        self.seal()
        with self.assertRaisesRegex(module.InvalidMilestone, "DUPLICATE_RECEIPT_FIELD"):
            self.validate()

    def test_hash_mismatch_is_rejected(self):
        (self.pack / "README.txt").write_text("altered")
        with self.assertRaisesRegex(module.InvalidMilestone, "CHECKSUM_MISMATCH"):
            self.validate()

    def test_manifest_cannot_hide_missing_duplicate_or_unsafe_names(self):
        manifest = (self.pack / "SHA256SUMS").read_text()
        for altered in ("\n".join(manifest.splitlines()[:-1]), manifest + manifest.splitlines()[0] + "\n",
                        manifest + "0" * 64 + "  ../outside.txt\n"):
            with self.subTest(manifest=altered[-30:]):
                (self.pack / "SHA256SUMS").write_text(altered)
                with self.assertRaises(module.InvalidMilestone):
                    self.validate()

    def test_missing_extra_and_symlinked_files_are_rejected(self):
        readme = self.pack / "README.txt"
        readme.unlink()
        with self.assertRaises(module.InvalidMilestone):
            self.validate()
        self.make_package()
        extra = self.pack / "extra.txt"
        extra.write_text("extra")
        with self.assertRaises(module.InvalidMilestone):
            self.validate()
        extra.unlink()
        readme.unlink()
        readme.symlink_to(self.bundle)
        with self.assertRaises(module.InvalidMilestone):
            self.validate()

    def test_duplicate_or_incomplete_apk_entries_are_rejected(self):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(self.pack / "AndroidAutomation-milestone.apk", "a") as apk:
                apk.writestr("assets/AndroidAutomation.js", self.bundle.read_bytes())
        self.seal()
        with self.assertRaisesRegex(module.InvalidMilestone, "DUPLICATE_APK_ENTRY"):
            self.validate()
        with zipfile.ZipFile(self.pack / "AndroidAutomation-milestone.apk", "w") as apk:
            apk.writestr("assets/AndroidAutomation.js", self.bundle.read_bytes())
        self.seal()
        with self.assertRaisesRegex(module.InvalidMilestone, "APK_STRUCTURE_MISMATCH"):
            self.validate()

    def test_downloaded_bytes_must_match_the_preupload_manifest(self):
        expected = self.root / "expected-checksums"
        expected.write_bytes((self.pack / "SHA256SUMS").read_bytes())
        self.validate(expected)
        (self.pack / "README.txt").write_text("changed after upload")
        self.seal()
        with self.assertRaisesRegex(module.InvalidMilestone, "UPLOADED_BYTES_CHANGED"):
            self.validate(expected)

    def test_cli_rejects_malformed_apk_without_echoing_payload(self):
        command = [sys.executable, spec.origin, "--directory", str(self.pack),
                   "--commit", self.commit, "--source-bundle", str(self.bundle)]
        self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
        (self.pack / "AndroidAutomation-milestone.apk").write_bytes(b"PRIVATE_MALFORMED_PAYLOAD")
        self.seal()
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("PRIVATE_", result.stdout + result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
