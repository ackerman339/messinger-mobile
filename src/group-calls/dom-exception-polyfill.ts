if (typeof globalThis.DOMException === 'undefined') {
  class DOMExceptionPolyfill extends Error {
    readonly code = 0;

    constructor(message = '', name = 'Error') {
      super(message);
      this.name = name;
    }
  }

  Object.defineProperty(globalThis, 'DOMException', {
    value: DOMExceptionPolyfill,
    configurable: true,
    writable: true,
  });
}
