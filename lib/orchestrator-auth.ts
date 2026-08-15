import { timingSafeEqual } from "node:crypto";

export function hasValidOrchestratorSecret({
  received,
  configured,
}: {
  received: string | null;
  configured: string | undefined;
}) {
  if (!received || !configured) {
    return false;
  }

  const receivedValue = Buffer.from(received);
  const configuredValue = Buffer.from(configured);

  if (receivedValue.length !== configuredValue.length) {
    return false;
  }

  return timingSafeEqual(receivedValue, configuredValue);
}
