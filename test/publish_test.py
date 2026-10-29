"""Offline publication ordering tests: fake gh, real Bash and byte validator."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import unittest
import milestone_test as fixtures

MOCK_GH = r'''
import hashlib, json, os, shutil, sys
from pathlib import Path
args = sys.argv[1:]
root = Path(os.environ["MOCK_RELEASE"])
assets = root / "assets"
state = root / "state"
with (root / "commands").open("a") as out:
    out.write(json.dumps(args) + "\n")
operation = args[1]
if operation == "view":
    if not state.exists(): sys.exit(1)
    print("true" if state.read_text() == "draft" else "false")
elif operation in ("create", "upload"):
    assets.mkdir(exist_ok=True)
    for value in args[3:]:
        path = Path(value)
        if path.is_file(): shutil.copyfile(path, assets / path.name)
    state.write_text("draft")
elif operation == "download":
    destination = Path(args[args.index("--dir") + 1])
    for path in assets.iterdir(): shutil.copyfile(path, destination / path.name)
    if os.environ.get("MOCK_TAMPER") == "true":
        (destination / "README.txt").write_text("modified remote bytes")
        names = sorted(p.name for p in destination.iterdir() if p.name != "SHA256SUMS")
        (destination / "SHA256SUMS").write_text("".join(
            hashlib.sha256((destination / name).read_bytes()).hexdigest()+"  "+name+"\n" for name in names))
elif operation == "edit":
    assert "--draft=false" in args
    state.write_text("published")
else: sys.exit(2)
'''


class PublishTests(fixtures.MilestoneFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.remote = self.root / "remote"
        self.remote.mkdir()
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        gh = bin_dir / "gh"
        gh.write_text("#!" + sys.executable + "\n" + MOCK_GH)
        gh.chmod(0o755)
        self.env = {**os.environ, "PATH": str(bin_dir) + os.pathsep + os.environ["PATH"],
                    "GITHUB_SHA": self.commit, "GITHUB_REPOSITORY": "synthetic/fixture",
                    "RELEASE_TAG": "milestone-" + self.commit, "MOCK_RELEASE": str(self.remote)}

    def run_publisher(self):
        script = Path(__file__).resolve().parents[1] / "tool/publish-milestone.sh"
        return subprocess.run(["bash", str(script), str(self.pack), str(self.bundle)],
                              env=self.env, capture_output=True, text=True, timeout=15)

    def operations(self):
        log = self.remote / "commands"
        return [json.loads(line)[1] for line in log.read_text().splitlines()] if log.exists() else []

    def existing(self, state):
        shutil.copytree(self.pack, self.remote / "assets")
        (self.remote / "state").write_text(state)

    def test_new_release_is_staged_verified_then_published(self):
        result = self.run_publisher()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.operations(), ["view", "create", "download", "edit"])
        self.assertEqual((self.remote / "state").read_text(), "published")

    def test_bad_local_payload_never_contacts_release_api(self):
        self.make_apk(b"stale exported script")
        self.seal()
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.operations(), [])

    def test_rehashed_remote_tampering_keeps_release_unpublished(self):
        self.env["MOCK_TAMPER"] = "true"
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("UPLOADED_BYTES_CHANGED", result.stderr)
        self.assertNotIn("edit", self.operations())
        self.assertEqual((self.remote / "state").read_text(), "draft")

    def test_interrupted_draft_can_resume(self):
        self.existing("draft")
        (self.remote / "assets" / "README.txt").write_text("incomplete old upload")
        result = self.run_publisher()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.operations(), ["view", "upload", "download", "edit"])

    def test_published_release_is_verified_without_replacement(self):
        self.existing("published")
        original = (self.remote / "assets" / "AndroidAutomation-milestone.apk").read_bytes()
        result = self.run_publisher()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.operations(), ["view", "download"])
        self.assertEqual((self.remote / "assets" / "AndroidAutomation-milestone.apk").read_bytes(), original)

    def test_wrong_tag_never_contacts_release_api(self):
        self.env["RELEASE_TAG"] = "unrelated-release"
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.operations(), [])


if __name__ == "__main__":
    unittest.main()
