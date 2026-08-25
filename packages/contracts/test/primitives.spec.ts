import { describe, expect, it } from "vitest";

import {
  ActorV1,
  CursorV1,
  EventSeqV1,
  EventTypeV1,
  OpaqueIdV1,
  UtcTimestampV1,
} from "../src/primitives.js";
import { ResolvedMentionItemV1, VersionAfterCreateV1 } from "../src/events.js";

describe("OpaqueIdV1", () => {
  it("accepts the inclusive one-to-255-character bounds", () => {
    expect(OpaqueIdV1.parse("x")).toBe("x");
    expect(OpaqueIdV1.parse("x".repeat(255))).toHaveLength(255);
  });

  it("rejects empty, oversized, and non-string IDs", () => {
    expect(OpaqueIdV1.safeParse("").success).toBe(false);
    expect(OpaqueIdV1.safeParse("x".repeat(256)).success).toBe(false);
    expect(OpaqueIdV1.safeParse(1).success).toBe(false);
  });
});

describe("CursorV1", () => {
  it("accepts branded cursor strings at both inclusive bounds", () => {
    expect(CursorV1.parse("1")).toBe("1");
    expect(CursorV1.parse("c".repeat(4096))).toHaveLength(4096);
  });

  it("rejects empty, oversized, and non-string cursors", () => {
    expect(CursorV1.safeParse("").success).toBe(false);
    expect(CursorV1.safeParse("c".repeat(4097)).success).toBe(false);
    expect(CursorV1.safeParse(1).success).toBe(false);
  });
});

describe("EventSeqV1", () => {
  it("accepts the minimum and PostgreSQL BIGINT maximum without number coercion", () => {
    expect(EventSeqV1.parse("1")).toBe("1");
    expect(EventSeqV1.parse("9223372036854775807")).toBe("9223372036854775807");
    expect(EventSeqV1.safeParse(1n).success).toBe(false);
  });

  it.each([
    ["zero", "0"],
    ["leading zero", "01"],
    ["plus sign", "+1"],
    ["minus sign", "-1"],
    ["decimal", "1.0"],
    ["exponent", "1e3"],
    ["leading whitespace", " 1"],
    ["trailing whitespace", "1 "],
    ["BIGINT overflow", "9223372036854775808"],
    ["more than 19 digits", "10000000000000000000"],
  ])("rejects %s syntax or range", (_label, candidate) => {
    expect(EventSeqV1.safeParse(candidate).success).toBe(false);
  });
});

describe("UtcTimestampV1", () => {
  it("accepts RFC 3339 timestamps in UTC with a Z suffix", () => {
    expect(UtcTimestampV1.parse("2026-08-25T12:34:56Z")).toBe("2026-08-25T12:34:56Z");
    expect(UtcTimestampV1.parse("2026-08-25T12:34:56.123Z")).toBe("2026-08-25T12:34:56.123Z");
  });

  it.each([
    "2026-08-25T12:34Z",
    "2026-08-25T12:34:56z",
    "2026-02-30T12:34:56Z",
    "2026-08-25T24:34:56Z",
    "2026-08-25T12:60:56Z",
    "2026-08-25T12:34:60Z",
    "2026-08-25T12:34:56+00:00",
    "2026-08-25T12:34:56-04:00",
    "2026-08-25T12:34:56",
    "2026-08-25",
    "not-a-timestamp",
  ])("rejects non-UTC-Z or malformed timestamp %s", (candidate) => {
    expect(UtcTimestampV1.safeParse(candidate).success).toBe(false);
  });
});

describe("EventTypeV1", () => {
  it.each(["a.b", "message.created", "channel.member_joined", "a_1.b2_c"])(
    "accepts generic lowercase dotted event type %s",
    (candidate) => {
      expect(EventTypeV1.parse(candidate)).toBe(candidate);
    },
  );

  it.each([
    "message",
    ".message.created",
    "message.created.",
    "message..created",
    "Message.created",
    "message.Created",
    "message-created",
    "1message.created",
  ])("rejects malformed event type %s", (candidate) => {
    expect(EventTypeV1.safeParse(candidate).success).toBe(false);
  });
});

describe("ActorV1", () => {
  it.each(["human", "service", "system"] as const)("accepts a strict %s actor", (kind) => {
    expect(ActorV1.parse({ principal_id: "prn_1", kind })).toEqual({
      principal_id: "prn_1",
      kind,
    });
  });

  it("rejects unknown fields, missing fields, invalid IDs, and invalid kinds", () => {
    expect(ActorV1.safeParse({ principal_id: "prn_1", kind: "human", extra: true }).success).toBe(
      false,
    );
    expect(ActorV1.safeParse({ principal_id: "prn_1" }).success).toBe(false);
    expect(ActorV1.safeParse({ principal_id: "", kind: "human" }).success).toBe(false);
    expect(ActorV1.safeParse({ principal_id: "prn_1", kind: "bot" }).success).toBe(false);
  });
});

describe("event payload primitives", () => {
  it("keeps resolved mention items strict", () => {
    expect(
      ResolvedMentionItemV1.parse({ principal_id: "prn_1", mention_item_id: "mit_1" }),
    ).toEqual({ principal_id: "prn_1", mention_item_id: "mit_1" });
    expect(
      ResolvedMentionItemV1.safeParse({
        principal_id: "prn_1",
        mention_item_id: "mit_1",
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("accepts only safe integer post-create versions from two through MAX_SAFE_INTEGER", () => {
    expect(VersionAfterCreateV1.parse(2)).toBe(2);
    expect(VersionAfterCreateV1.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(VersionAfterCreateV1.safeParse(1).success).toBe(false);
    expect(VersionAfterCreateV1.safeParse(2.5).success).toBe(false);
    expect(VersionAfterCreateV1.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
    expect(VersionAfterCreateV1.safeParse("2").success).toBe(false);
  });
});
