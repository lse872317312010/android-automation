import importlib.util
from pathlib import Path
import tempfile
import hashlib
import json
import subprocess
import sys
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location(
    "native_results", Path(__file__).resolve().parents[1] / "tool/verify-android-results.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NativeResultTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def report(self, names=None, outcome=None, **attributes):
        root = ET.Element("testsuite", attributes)
        for name in sorted(module.EXPECTED if names is None else names):
            case = ET.SubElement(root, "testcase", classname=module.CLASS, name=name)
            if outcome:
                ET.SubElement(case, outcome)
        ET.ElementTree(root).write(self.directory / "TEST-native.xml")
        return root

    def test_complete_inventory(self):
        self.report()
        self.assertEqual(module.validate(self.directory), 3)

    def test_missing_report(self):
        with self.assertRaises(ValueError):
            module.validate(self.directory)

    def test_empty_report(self):
        self.report(names=[])
        with self.assertRaises(ValueError):
            module.validate(self.directory)

    def test_missing_case(self):
        self.report(names=sorted(module.EXPECTED)[:2])
        with self.assertRaises(ValueError):
            module.validate(self.directory)

    def test_failure_error_and_skip(self):
        for outcome in ("failure", "error", "skipped"):
            with self.subTest(outcome=outcome):
                self.report(outcome=outcome)
                with self.assertRaises(ValueError):
                    module.validate(self.directory)

    def test_duplicate_reports(self):
        self.report()
        (self.directory / "duplicate.xml").write_bytes(
            (self.directory / "TEST-native.xml").read_bytes())
        with self.assertRaises(ValueError):
            module.validate(self.directory)

    def test_summary_failure_without_child(self):
        self.report(failures="1")
        with self.assertRaises(ValueError):
            module.validate(self.directory)

    def test_wrong_class_or_extra_case(self):
        root = self.report()
        root.find("testcase").set("classname", "wrong.Class")
        ET.ElementTree(root).write(self.directory / "TEST-native.xml")
        with self.assertRaises(ValueError):
            module.validate(self.directory)
        self.report(names=list(module.EXPECTED) + ["unexpected"])
        with self.assertRaises(ValueError):
            module.validate(self.directory)

    def test_receipt_identity_and_failed_rerun(self):
        self.report()
        bundle = self.directory / "bundle.js"
        bundle.write_bytes(b"synthetic bundle")
        output = self.directory / "receipt.json"
        command = [sys.executable, str(spec.origin), "--results", str(self.directory),
                   "--bundle", str(bundle), "--commit", "a" * 40,
                   "--api", "30", "--output", str(output)]
        child = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(child.returncode, 0, child.stderr)
        receipt = json.loads(output.read_text())
        self.assertEqual(receipt["commit"], "a" * 40)
        self.assertEqual(receipt["scriptSha256"], hashlib.sha256(bundle.read_bytes()).hexdigest())
        self.assertEqual(receipt["deviceValidation"], "not_established")
        self.assertEqual(receipt["testCount"], 3)
        self.report(outcome="skipped")
        child = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(child.returncode, 0)
        self.assertFalse(output.exists())

    def test_malformed_report(self):
        (self.directory / "TEST-native.xml").write_text("<testsuite>")
        with self.assertRaises(ET.ParseError):
            module.validate(self.directory)


if __name__ == "__main__":
    unittest.main()
