import { describe, it, expect } from "vitest";
import { reviewSchema, ownerResponseSchema } from "../schemas";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("reviewSchema", () => {
  it("accepts a clean 10-char review", () => {
    const r = reviewSchema.parse({ business_id: UUID, rating: 5, content: "great food" });
    expect(r.content).toBe("great food");
  });
  it("rejects content shorter than 10 after sanitisation", () => {
    expect(() => reviewSchema.parse({ business_id: UUID, rating: 3, content: "short" })).toThrow();
  });
  it("rejects content longer than 1000", () => {
    expect(() =>
      reviewSchema.parse({ business_id: UUID, rating: 3, content: "a".repeat(1001) }),
    ).toThrow();
  });
  it("strips <script> tags before length check", () => {
    const r = reviewSchema.parse({
      business_id: UUID,
      rating: 4,
      content: "<script>alert(1)</script>delicious meal",
    });
    expect(r.content).not.toMatch(/<script/i);
    expect(r.content).toContain("delicious meal");
  });
  it("strips control characters", () => {
    const r = reviewSchema.parse({
      business_id: UUID,
      rating: 4,
      content: "good\u0001food was tasty",
    });
    expect(r.content).not.toMatch(/\u0001/);
  });
  it("rejects rating out of 1-5", () => {
    expect(() => reviewSchema.parse({ business_id: UUID, rating: 6, content: "ok ok ok ok" })).toThrow();
    expect(() => reviewSchema.parse({ business_id: UUID, rating: 0, content: "ok ok ok ok" })).toThrow();
  });
});

describe("ownerResponseSchema", () => {
  it("enforces 10-500 bounds after sanitisation", () => {
    expect(() =>
      ownerResponseSchema.parse({ review_id: UUID, business_id: UUID, content: "thanks!" }),
    ).toThrow();
    expect(() =>
      ownerResponseSchema.parse({ review_id: UUID, business_id: UUID, content: "a".repeat(501) }),
    ).toThrow();
    const ok = ownerResponseSchema.parse({
      review_id: UUID,
      business_id: UUID,
      content: "thanks for visiting",
    });
    expect(ok.content).toBe("thanks for visiting");
  });
});