import { describe, expect, test } from "bun:test";
import {
  isPublishable,
  publishReason,
  orderForFanout,
} from "./publish-targets";
import type { ChannelId } from "./channel-formats";

const CONNECTED = { hasBlogDomain: true, hasLinkedIn: true };
const NONE = { hasBlogDomain: false, hasLinkedIn: false };

describe("isPublishable", () => {
  test("blog publishable only with an active domain", () => {
    expect(isPublishable("hosted", CONNECTED)).toBe(true);
    expect(isPublishable("hosted", { ...CONNECTED, hasBlogDomain: false })).toBe(false);
  });

  test("linkedin publishable only with OAuth", () => {
    expect(isPublishable("linkedin", CONNECTED)).toBe(true);
    expect(isPublishable("linkedin", { ...CONNECTED, hasLinkedIn: false })).toBe(false);
  });

  test("not-built channels are never publishable, even 'connected'", () => {
    for (const c of ["x", "facebook", "instagram", "threads", "telegram", "tiktok"] as ChannelId[]) {
      expect(isPublishable(c, CONNECTED)).toBe(false);
    }
  });
});

describe("publishReason", () => {
  test("missing connection → connect reason; soon for not-built", () => {
    expect(publishReason("hosted", NONE)).toBe("domain");
    expect(publishReason("linkedin", NONE)).toBe("linkedin");
    expect(publishReason("telegram", CONNECTED)).toBe("soon");
  });

  test("null reason when publishable", () => {
    expect(publishReason("hosted", CONNECTED)).toBeNull();
    expect(publishReason("linkedin", CONNECTED)).toBeNull();
  });
});

describe("orderForFanout", () => {
  test("blog goes first so social cross-links resolve", () => {
    expect(orderForFanout(["linkedin", "hosted"])).toEqual(["hosted", "linkedin"]);
    expect(orderForFanout(["x", "hosted", "linkedin"])[0]).toBe("hosted");
  });

  test("no blog → order preserved; does not mutate input", () => {
    const input: ChannelId[] = ["linkedin", "x"];
    expect(orderForFanout(input)).toEqual(["linkedin", "x"]);
    expect(input).toEqual(["linkedin", "x"]);
  });
});
