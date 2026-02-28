import {
  LAMBDA_ZIP_BASE64,
  LAMBDA_ZIP_SHA256,
} from "./lambda-artifact.generated.js";

export const FORWARDER_LAMBDA_ZIP_SHA256 = LAMBDA_ZIP_SHA256;

/**
 * Decode generated lambda artifact bytes.
 *
 * @since 1.0.0
 * @category AWS.Lambda
 */
export function getForwarderLambdaZipBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(LAMBDA_ZIP_BASE64, "base64"));
}
