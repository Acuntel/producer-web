import { test } from "node:test";
import assert from "node:assert/strict";
import { skillsFor, skillsBlock, SKILL_IDS } from "../lib/brain/skills.ts";

test("skills: five compiled, triggers pick the right ones, block is capped", () => {
  assert.ok(SKILL_IDS.length >= 5, `skills compiled: ${SKILL_IDS.join(",")}`);
  assert.ok(skillsFor("why does this not make people dance").includes("dance-science"));
  assert.ok(skillsFor("pull the kick from this youtube link").includes("sampling-and-stems"));
  assert.ok(skillsFor("add a vocal chop on the offbeat").includes("vocals"));
  assert.ok(skillsFor("make it dubstep").includes("genres"));
  assert.equal(skillsFor("turn the hats down").length, 0);
  const block = skillsBlock(SKILL_IDS);
  assert.ok(block && block.length <= 9200, "block capped");
  assert.ok(/SKILLS LOADED/.test(block));
});
