// Polyfill for crypto.subtle in insecure contexts.
//
// The static server function middleware hashes its payload with
// `crypto.subtle.digest('SHA-1', ...)` to derive the cache-file name under
// /__tsr/staticServerFnCache/. `crypto.subtle` only exists in secure
// contexts (HTTPS or localhost), so serving the prerendered site over plain
// HTTP on any other host (e.g. 0.0.0.0, a LAN IP) makes client-side
// navigation throw "Cannot read properties of undefined (reading 'digest')".
//
// This module installs a minimal WebCrypto polyfill when needed. It must be
// imported before anything that can trigger a server function call.

import { sha1 } from '@noble/hashes/legacy.js';

export function installInsecureContextPolyfills(): void {
  if (typeof window === 'undefined') return;
  if (window.crypto?.subtle) return; // secure context — nothing to do

  const subtle: SubtleCrypto = {
    digest(algorithm: AlgorithmIdentifier, data: ArrayBuffer | BufferSource) {
      // @noble/hashes is a standalone implementation (no WebCrypto dependency),
      // so it's safe to call from inside the polyfilled digest().
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
      const digestBytes = sha1(bytes);
      return Promise.resolve(digestBytes.buffer.slice(
        digestBytes.byteOffset,
        digestBytes.byteOffset + digestBytes.byteLength,
      ));
    },
  } as unknown as SubtleCrypto;

  Object.defineProperty(window, 'crypto', {
    value: { ...(window.crypto ?? {}), subtle },
    configurable: true,
    writable: true,
  });
}
