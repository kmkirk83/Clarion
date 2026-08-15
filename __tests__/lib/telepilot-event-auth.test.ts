import { createHmac } from "node:crypto";

import { hasValidTelepilotSignature } from "@/lib/telepilot-event-auth";

describe("Telepilot event authentication", () => {
  const secret = "clarion-telepilot-event-secret-that-is-long-enough";
  const rawBody = JSON.stringify({ organizationId: "org_123", request: { type: "TELEPILOT_EVENT" } });
  const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

  it("accepts a correctly signed payload", () => {
    expect(
      hasValidTelepilotSignature({
        rawBody,
        received: signature,
        secret,
      })
    ).toBe(true);
  });

  it("rejects altered payloads, unsupported prefixes, and missing secrets", () => {
    expect(
      hasValidTelepilotSignature({
        rawBody: `${rawBody} `,
        received: signature,
        secret,
      })
    ).toBe(false);
    expect(
      hasValidTelepilotSignature({
        rawBody,
        received: signature.replace("sha256=", "md5="),
        secret,
      })
    ).toBe(false);
    expect(hasValidTelepilotSignature({ rawBody, received: signature, secret: undefined })).toBe(false);
  });
});
