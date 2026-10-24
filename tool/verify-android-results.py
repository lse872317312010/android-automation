"""Validate native framework JUnit evidence; never attest physical devices."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

CLASS = "dev.androidautomation.harness.FrameworkContractTest"
EXPECTED = {
    "fixtureScreenshotAndSingleInjectedTap",
    "closedFixtureRejectsInput",
    "shippedBundleWithAndroidValues",
    "ownedBitmapCopyCanBeRecycledWithoutInvalidatingSource",
    "privateDirectoryRenameRetainsBaselineOnFailure",
}


def validate(results):
    files = sorted(Path(results).rglob("*.xml"))
    if not files:
        raise ValueError("Native JUnit reports missing")
    seen = set()
    for file in files:
        root = ET.parse(file).getroot()
        if root.tag not in ("testsuite", "testsuites"):
            raise ValueError("Unexpected JUnit root")
        for node in root.iter():
            if node.tag in ("failure", "error", "skipped"):
                raise ValueError("Native tests failed or skipped")
            if node.tag in ("testsuite", "testsuites"):
                for field in ("failures", "errors", "skipped", "disabled"):
                    if int(node.get(field, "0")) != 0:
                        raise ValueError("Nonzero native failure/skip count")
        for case in root.iter("testcase"):
            identity = (case.get("classname"), case.get("name"))
            if identity in seen:
                raise ValueError("Duplicate native testcase")
            seen.add(identity)
    expected = {(CLASS, name) for name in EXPECTED}
    if seen != expected:
        raise ValueError("Native testcase inventory mismatch")
    return len(seen)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", required=True)
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--api", required=True, type=int)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output)
    # Never leave an earlier successful receipt behind after a rejected rerun.
    output.unlink(missing_ok=True)
    if not re.fullmatch(r"[0-9a-f]{40}", args.commit) or args.api < 26:
        raise ValueError("Invalid evidence identity")
    count = validate(args.results)
    report = {
        "schema": "android-framework-contract.v1",
        "tier": "partial_T3_framework",
        "deviceValidation": "not_established",
        "commit": args.commit,
        "scriptSha256": hashlib.sha256(Path(args.bundle).read_bytes()).hexdigest(),
        "emulatorApi": args.api,
        "testCount": count,
        "status": "passed",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
