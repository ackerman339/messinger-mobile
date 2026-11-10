import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

/** Hash the original SDP bytes, without normalizing line endings. */
export function sdpHash(sdp: string) {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, sdp);
}
