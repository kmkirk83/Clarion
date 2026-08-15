import { createHmac, timingSafeEqual } from "node:crypto";

export function hasValidTelepilotSignature({
  rawBody,
  received,
  secret,
}: {
  rawBody: string;
  received: string | null;
  secret: string | undefined;
}) {
  if (!received || !secret || !received.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const receivedValue = Buffer.from(received);
  const expectedValue = Buffer.from(expected);

  if (receivedValue.length !== expectedValue.length) {
    return false;
  }

  return timingSafeEqual(receivedValue, expectedValue);
}
