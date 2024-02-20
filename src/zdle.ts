import ZMLIB from './zmlib'
import { ZDLEConfig } from './types'

/**
 * Class that handles ZDLE encoding and decoding.
 * Encoding is subject to a given configuration--specifically, whether
 * we want to escape all control characters. Decoding is static; however
 * a given string is encoded we can always decode it.
 */
class ZmodemZDLE {
  _config: ZDLEConfig = { escape_ctrl_chars: false, turbo_escape: false }
  _zdle_table?: number[]
  _lastcode?: number

  /**
   * Create a ZDLE encoder.
   *
   * @param {object} [config] - The initial configuration.
   * @param {object} config.escape_ctrl_chars - Whether the ZDLE encoder
   *  should escape control characters.
   */
  constructor (config?: ZDLEConfig) {
    if (config !== undefined) {
      this.set_escape_ctrl_chars(config.escape_ctrl_chars)
    }
  }

  set_escape_ctrl_chars (value: boolean): void {
    if (value !== this._config.escape_ctrl_chars) {
      this._config.escape_ctrl_chars = value
      this._setup_zdle_table()
    }
  }

  /**
   * Whether or not control-character escaping is enabled.
   *
   * @return {boolean} Whether the escaping is on (true) or off (false).
   */
  escapes_ctrl_chars (): boolean {
    return this._config.escape_ctrl_chars
  }

  /**
   * Encode an array of octet values and return it.
   * This will mutate the given array.
   *
   * @param {number[]} octets - The octet values to transform.
   *      Each array member should be an 8-bit unsigned integer (0-255).
   *      This object is mutated in the function.
   *
   * @returns {number[]} The passed-in array, transformed. This is the
   *  same object that is passed in.
   */
  encode (octets: number[]): number[] {
    // NB: Performance matters here!
    console.log('this._zdle_table', this._zdle_table)
    if (this._zdle_table === undefined) {
      throw new Error('No ZDLE encode table configured!')
    }

    const zdleTable = this._zdle_table

    let lastCode = this._lastcode

    const arrbuf = new ArrayBuffer(2 * octets.length)
    const arrbufUint8 = new Uint8Array(arrbuf)

    const escctlYn = this._config.escape_ctrl_chars

    let arrbufI = 0

    for (let encodeCur = 0; encodeCur < octets.length; encodeCur++) {
      const encodeTodo = zdleTable[octets[encodeCur]]
      if (encodeTodo === undefined) {
        console.error('bad encode() call:', JSON.stringify(octets))
        this._lastcode = lastCode
        throw new Error(`Invalid octet:  ${octets[encodeCur]}`)
      }

      lastCode = octets[encodeCur]

      if (encodeTodo === 1) {
        // Do nothing; we append last_code below.
      } else if (escctlYn || encodeTodo === 2 || (lastCode & 0x7f) === 0x40) {
        arrbufUint8[arrbufI] = ZMLIB.ZDLE
        arrbufI++

        lastCode ^= 0x40 // 0100
      }

      arrbufUint8[arrbufI] = lastCode

      arrbufI++
    }

    this._lastcode = lastCode

    octets.splice(0)
    octets.push(...new Uint8Array(arrbuf, 0, arrbufI))

    return octets
  }

  /**
   * Decode an array of octet values and return it.
   * This will mutate the given array.
   *
   * @param {number[]} octets - The octet values to transform.
   *      Each array member should be an 8-bit unsigned integer (0-255).
   *      This object is mutated in the function.
   *
   * @returns {number[]} The passed-in array.
   *  This is the same object that is passed in.
   */
  static decode (octets: number[]): number[] {
    for (let o = octets.length - 1; o >= 0; o--) {
      if (octets[o] === ZMLIB.ZDLE) {
        octets.splice(o, 2, octets[o + 1] - 64)
      }
    }

    return octets
  }

  /**
   * Remove, ZDLE-decode, and return bytes from the passed-in array.
   * If the requested number of ZDLE-encoded bytes isn’t available,
   * then the passed-in array is unmodified (and the return is undefined).
   *
   * @param {number[]} octets - The octet values to transform.
   *      Each array member should be an 8-bit unsigned integer (0-255).
   *      This object is mutated in the function.
   *
   * @param {number} offset - The number of (undecoded) bytes to skip
   *      at the beginning of the “octets” array.
   *
   * @param {number} count - The number of bytes (octet values) to return.
   *
   * @returns {number[]|undefined} An array with the requested number of
   *      decoded octet values, or undefined if that number of decoded
   *      octets isn’t available (given the passed-in offset).
   */
  static splice (octets: number[], offset: number = 0, count: number): number[] | undefined {
    let soFar = 0
    let i = offset
    for (; i < octets.length && soFar < count; i++) {
      soFar++

      if (octets[i] === ZMLIB.ZDLE) i++
    }

    if (soFar === count) {
      // Don’t accept trailing ZDLE. This check works
      // because of the i++ logic above.
      if (octets.length === i - 1) return undefined

      octets.splice(0, offset)
      return ZmodemZDLE.decode(octets.splice(0, i - offset))
    }

    return undefined
  }

  _setup_zdle_table (): void {
    const zsendlineTab = new Array(256)
    for (let i = 0; i < zsendlineTab.length; i++) {
      // 1 = never escape
      // 2 = always escape
      // 3 = escape only if the previous byte was '@'

      // Never escape characters from 0x20 (32) to 0x7f (127).
      // This is the range of printable characters, plus DEL.
      // I guess ZMODEM doesn’t consider DEL to be a control character?
      if ((i & 0x60) !== 0) {
        zsendlineTab[i] = 1
      } else {
        switch (i) {
          case ZMLIB.ZDLE: // NB: no (ZDLE | 0x80)
          case ZMLIB.XOFF:
          case ZMLIB.XON:
          case ZMLIB.XOFF | 0x80:
          case ZMLIB.XON | 0x80:
            zsendlineTab[i] = 2
            break

          case 0x10:
          case 0x90:
            zsendlineTab[i] = this._config.turbo_escape ? 1 : 2
            break

          case 0x0d:
          case 0x8d:
            zsendlineTab[i] =
              this._config.escape_ctrl_chars
                ? 2
                : !this._config.turbo_escape
                    ? 3
                    : 1
            break

          default:
            zsendlineTab[i] = this._config.escape_ctrl_chars ? 2 : 1
        }
      }
    }

    this._zdle_table = zsendlineTab
  }
}

export default ZmodemZDLE
