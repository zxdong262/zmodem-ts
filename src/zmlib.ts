const ZDLE = 0x18
const XON = 0x11
const XOFF = 0x13
const XON_HIGH = 0x80 | XON
const XOFF_HIGH = 0x80 | XOFF
const CAN = 0x18 // NB: same character as ZDLE

// interface Octets extends Array<number>

export default {
  /**
   * @property {number} The ZDLE constant, which ZMODEM uses for escaping
   */
  ZDLE,

  /**
   * @property {number} XON - ASCII XON
   */
  XON,

  /**
   * @property {number} XOFF - ASCII XOFF
   */
  XOFF,

  /**
   * @property {number[]} ABORT_SEQUENCE - ZMODEM’s abort sequence
   */
  ABORT_SEQUENCE: [CAN, CAN, CAN, CAN, CAN],

  /**
   * Remove octet values from the given array that ZMODEM always ignores.
   * This will mutate the given array.
   *
   * @param {number[]} octets - The octet values to transform.
   *      Each array member should be an 8-bit unsigned integer (0-255).
   *      This object is mutated in the function.
   *
   * @returns {number[]} The passed-in array. This is the same object that is
   *      passed in.
   */
  stripIgnoredBytes (octets: number[]): number[] {
    for (let o = octets.length - 1; o >= 0; o--) {
      switch (octets[o]) {
        case XON:
        case XON_HIGH:
        case XOFF:
        case XOFF_HIGH:
          octets.splice(o, 1)
          continue
      }
    }

    return octets
  },

  /**
   * Like Array.prototype.indexOf, but searches for a subarray
   * rather than just a particular value.
   *
   * @param {Array} haystack - The array to search, i.e., the bigger.
   *
   * @param {Array} needle - The array whose values to find,
   *      i.e., the smaller.
   *
   * @returns {number} The position in “haystack” where “needle”
   *      first appears—or, -1 if “needle” doesn’t appear anywhere
   *      in “haystack”.
   */
  findSubarray (haystack: number[], needle: number[]): number {
    let h = 0
    let n
    while (h !== -1) {
      h = haystack.indexOf(needle[0], h)

      if (h === -1) {
        break
      }

      for (n = 1; n < needle.length; n++) {
        if (haystack[h + n] !== needle[n]) {
          h++
          break
        }
      }

      if (n === needle.length) {
        return h
      }
    }
    return -1
  }
}
