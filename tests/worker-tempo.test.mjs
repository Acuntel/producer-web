// The worker's tempo (worker/analysis.py tempo_from_drums), run by Python on drums whose tempo and phase are known.
// It needs the worker's own libraries: set PRODUCER_PY to a Python with librosa, or keep the local ears' venv at
// ~/.dictation/producer/venv. Without either the test is skipped and says so; worker/tempo_check.py runs it by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const py = process.env.PRODUCER_PY ?? join(homedir(), ".dictation/producer/venv/bin/python");
const usable = existsSync(py) && spawnSync(py, ["-c", "import librosa, numpy"], { stdio: "ignore" }).status === 0;

test("the worker counts a tempo from the drums with a confidence, names a folded octave, and refuses noise", { skip: usable ? false : `no Python with librosa (set PRODUCER_PY); tried ${py}` }, () => {
  // No bytecode written: worker/__pycache__ is not this test's to touch.
  const r = spawnSync(py, ["worker/tempo_check.py", "--quick"], { encoding: "utf8", timeout: 120000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  const out = `${r.stdout}${r.stderr}`;
  assert.equal(r.status, 0, out);
  assert.match(out, /\[tempo\] ALL PASSED/);
  assert.match(out, /ok {3}\[tempo\] four on the floor: truth 128\.0/);
  assert.match(out, /ok {3}\[tempo\] white noise: refused -> None/);
});
