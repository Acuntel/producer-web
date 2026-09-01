import { test } from "node:test";
import assert from "node:assert/strict";
import { localIntent, matchTracks } from "../lib/brain/local.ts";
import { SEED_TECH_HOUSE } from "../lib/song/seeds.ts";
const s = SEED_TECH_HOUSE;
const opsOf = (t) => localIntent(t, s)?.ops ?? [];

test("transport and sections resolve locally", () => {
  assert.equal(localIntent("play", s).action.type, "play");
  assert.equal(localIntent("hold on", s).action.type, "pause");
  assert.deepEqual(localIntent("take me to the drop", s).action, { type: "goto", section: "drop" });
  assert.deepEqual(localIntent("go back to the breakdown", s).action, { type: "goto", section: "break" });
  assert.equal(localIntent("loop the drop", s).ops[0].loop.section, "drop");
  assert.equal(localIntent("loop build 2", s).ops[0].loop.section, "build2");
  assert.equal(localIntent("play the whole thing", s).ops[0].loop, null);
  assert.equal(localIntent("from the top", s).action.section, "intro");
});

test("mixer intents: solo, mute, unmute, everything back, volume", () => {
  assert.deepEqual(opsOf("solo the bass").map((o) => o.op), ["unsolo", "solo"]);
  assert.equal(opsOf("play me just the hats").find((o) => o.op === "solo").track, "hat");
  assert.equal(opsOf("bass alone").find((o) => o.op === "solo").track, "bass");
  assert.equal(opsOf("just the drums").filter((o) => o.op === "solo").length, 5);
  assert.deepEqual(opsOf("mute the pad"), [{ op: "mute", track: "pad" }]);
  assert.deepEqual(opsOf("kill the tambourine"), [{ op: "mute", track: "tamb" }]);
  assert.deepEqual(opsOf("bring back the pad"), [{ op: "unmute", track: "pad" }]);
  assert.deepEqual(opsOf("everything back in").map((o) => o.op), ["unsolo", "unmute"]);
  const up = opsOf("turn the hats up a bit")[0]; assert.equal(up.path, "volume"); assert.equal(up.value, -9 + 1.5);
  const down = opsOf("bass down a lot")[0]; assert.equal(down.value, -2 - 6);
  assert.equal(opsOf("more clap")[0].value, -4 + 3);
  assert.equal(opsOf("louder")[0].track, "master");
});

test("tempo, undo, ab, and non-intents fall through to the brain", () => {
  assert.equal(opsOf("make it 128")[0].bpm, 128);
  assert.equal(opsOf("130 bpm")[0].bpm, 130);
  assert.equal(opsOf("a bit faster")[0].bpm, 128);
  assert.equal(localIntent("undo", s).history, "undo");
  assert.equal(localIntent("play b", s).ab, "b");
  assert.equal(localIntent("keep a", s).ab, "keepA");
  assert.equal(localIntent("kill that", s), null, "verdict words go to the brain");
  assert.equal(localIntent("make the bass darker and take me to the drop", s), null);
  assert.equal(localIntent("this is boring, do something with the breakdown", s), null);
  assert.equal(localIntent("surprise me", s), null);
  assert.equal(matchTracks("the hi-hats", s)[0].id, "hat");
  assert.equal(matchTracks("open hat", s)[0].id, "openhat");
});
