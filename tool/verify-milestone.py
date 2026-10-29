"""Check milestone bytes and source/evidence binding; APK signatures use apksigner."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
import zipfile

PAYLOAD = {"AndroidAutomation-milestone.apk", "AndroidAutomation.js",
           "android-framework.json", "COMMIT.txt", "README.txt"}
FILES = PAYLOAD | {"SHA256SUMS"}
NATIVE_COUNT = len(runpy.run_path(str(Path(__file__).with_name("verify-android-results.py")))["EXPECTED"])


class InvalidMilestone(ValueError):
    pass


def reject(code):
    raise InvalidMilestone(code)


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            reject("DUPLICATE_RECEIPT_FIELD")
        result[key] = value
    return result


def validate(directory, commit, source_bundle, expected_checksums=None):
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        reject("INVALID_COMMIT")
    directory = Path(directory)
    entries = list(directory.iterdir())
    if {p.name for p in entries} != FILES or any(p.is_symlink() or not p.is_file() for p in entries):
        reject("FILE_INVENTORY_MISMATCH")
    checksum_bytes = (directory / "SHA256SUMS").read_bytes()
    if expected_checksums is not None and checksum_bytes != Path(expected_checksums).read_bytes():
        reject("UPLOADED_BYTES_CHANGED")
    hashes = {}
    for line in checksum_bytes.decode("ascii").splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9_.-]+)", line)
        if match is None or match[2] not in PAYLOAD or match[2] in hashes:
            reject("INVALID_CHECKSUM_INVENTORY")
        hashes[match[2]] = match[1]
    if set(hashes) != PAYLOAD:
        reject("INVALID_CHECKSUM_INVENTORY")
    for name, digest in hashes.items():
        if sha256(directory / name) != digest:
            reject("CHECKSUM_MISMATCH")
    if (directory / "COMMIT.txt").read_bytes() != (commit + "\n").encode("ascii"):
        reject("COMMIT_MISMATCH")
    script_sha = hashes["AndroidAutomation.js"]
    if sha256(source_bundle) != script_sha:
        reject("SOURCE_BUNDLE_MISMATCH")
    receipt = json.loads((directory / "android-framework.json").read_text(encoding="utf-8"),
                         object_pairs_hook=unique_object)
    expected = {
        "schema": "android-framework-contract.v1", "tier": "partial_T3_framework",
        "visualLoop": "emulator_pixels_mlkit_portable_policy",
        "productionAdapterValidated": False, "deviceValidation": "not_established",
        "commit": commit, "scriptSha256": script_sha, "emulatorApi": 30,
        "testCount": NATIVE_COUNT, "status": "passed",
    }
    if not isinstance(receipt, dict) or set(receipt) != set(expected):
        reject("RECEIPT_SCOPE_MISMATCH")
    if any(type(receipt[k]) is not type(value) or receipt[k] != value for k, value in expected.items()):
        reject("RECEIPT_BINDING_MISMATCH")
    with zipfile.ZipFile(directory / "AndroidAutomation-milestone.apk") as apk:
        names = apk.namelist()
        if len(set(names)) != len(names):
            reject("DUPLICATE_APK_ENTRY")
        if not {"AndroidManifest.xml", "classes.dex", "assets/AndroidAutomation.js"}.issubset(names):
            reject("APK_STRUCTURE_MISMATCH")
        asset = apk.getinfo("assets/AndroidAutomation.js")
        if asset.file_size > 2 * 1024 * 1024:
            reject("APK_SCRIPT_TOO_LARGE")
        if hashlib.sha256(apk.read(asset)).hexdigest() != script_sha:
            reject("APK_SCRIPT_MISMATCH")
    return {"schema": "milestone-consistency.v1", "status": "consistent", "commit": commit,
            "apkSha256": hashes["AndroidAutomation-milestone.apk"], "scriptSha256": script_sha,
            "deviceValidation": "not_established", "signatureGate": "separate_apksigner_check"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--source-bundle", required=True)
    parser.add_argument("--expected-checksums")
    args = parser.parse_args()
    try:
        result = validate(args.directory, args.commit, args.source_bundle, args.expected_checksums)
    except InvalidMilestone as error:
        parser.exit(1, str(error) + "\n")
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, RuntimeError):
        parser.exit(1, "INVALID_MILESTONE\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
