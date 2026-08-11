import assert from "node:assert/strict";
import test from "node:test";

import { buildGenerationPrompt, normalizeExtraInstruction, normalizeImageQuality, normalizeProductSizes } from "../src/worker.js";

test("full-photo mode uses the permanent ESNTLS grass flat-lay rules", () => {
  const instruction = "Leave more room above the product and use softer shadows.";
  const prompt = buildGenerationPrompt("hoodie.jpg", "flatlay", instruction);

  assert.match(prompt, /Use case: realistic ecommerce flat-lay/);
  assert.match(prompt, /exact supplied grass background/);
  assert.match(prompt, /50-68% of the canvas/);
  assert.match(prompt, /Preserve the product exactly/);
  assert.match(prompt, /Additional studio instruction:/);
  assert.ok(prompt.includes(instruction));
  assert.match(prompt, /preserving the product's identity/);
});

test("close-up mode preserves the exact crop and never invents missing areas", () => {
  const prompt = buildGenerationPrompt("hoodie.jpg", "keep-crop");

  assert.doesNotMatch(prompt, /Additional studio instruction:/);
  assert.match(prompt, /Preserve the exact framing, crop, product position/);
  assert.match(prompt, /Never zoom out, zoom in/);
  assert.match(prompt, /complete missing product areas/);
  assert.match(prompt, /exact ESNTLS Club green artificial-grass background/);
});

test("normalizes line endings and rejects instructions over 2000 characters", () => {
  assert.equal(normalizeExtraInstruction("  first line\r\nsecond line  "), "first line\nsecond line");
  assert.throws(
    () => normalizeExtraInstruction("x".repeat(2001)),
    /2000 characters or fewer/,
  );
});

test("uses medium image quality by default and accepts explicit supported values", () => {
  assert.equal(normalizeImageQuality(), "medium");
  assert.equal(normalizeImageQuality(" HIGH "), "high");
  assert.equal(normalizeImageQuality("unknown", "medium"), "medium");
});

test("footwear products do not keep stale clothing sizes", () => {
  assert.deepEqual(
    normalizeProductSizes(["S", "M", "L", "XL"], "MM GATS", ["Footwear"]),
    ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11", "UK 12"],
  );
});
