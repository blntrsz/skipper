import {
  LAMBDA_ZIP_BASE64,
  LAMBDA_ZIP_SHA256,
} from "./lambda-artifact.generated.js";

export const FORWARDER_LAMBDA_ZIP_SHA256 = LAMBDA_ZIP_SHA256;

export function getForwarderLambdaZipBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(LAMBDA_ZIP_BASE64, "base64"));
}
