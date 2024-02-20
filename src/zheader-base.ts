
import { ZmodemEncodeLib } from './encode'
import CRC from './zcrc'
import {
  HEX_HEADER_PREFIX,
  BINARY16_HEADER_PREFIX,
  BINARY32_HEADER_PREFIX,
  HEX_HEADER_CRLF_XON
} from './zheader-constants'
import { Obj } from './types'

/** Class that represents a ZMODEM header. */
class ZmodemHeaderBase {
  _hex_header_ending: number[] = HEX_HEADER_CRLF_XON
  TYPENUM: number = 0
  NAME: string = ''
  _bytes4: number[] = [0, 0, 0, 0]

  /**
   * Return the octet values array that represents the object
   * in ZMODEM hex encoding.
   *
   * @returns {number[]} An array of octet values suitable for sending
   *      as binary data.
   */
  to_hex (): number[] {
    const toCrc = this._crc_bytes()
    return HEX_HEADER_PREFIX.concat(
      ZmodemEncodeLib.octets_to_hex(toCrc.concat(CRC.crc16(toCrc))),
      this._hex_header_ending
    )
  }

  /**
   * Return the octet values array that represents the object
   * in ZMODEM binary encoding with a 16-bit CRC.
   *
   * @param {ZDLE} zencoder - A ZDLE instance to use for
   *      ZDLE encoding.
   *
   * @returns {number[]} An array of octet values suitable for sending
   *      as binary data.
   */
  to_binary16 (zencoder: any): number[] {
    return this._to_binary(zencoder, BINARY16_HEADER_PREFIX, CRC.crc16)
  }

  get_options (): Obj { return {} }
  get_offset (): number { return 0 }
  get_buffer_size (): any { return 0 }
  can_full_duplex (): boolean { return false }
  can_overlap_io (): boolean { return false }
  escape_8th_bit (): boolean { return false }
  escape_ctrl_chars (): boolean { return false }

  /**
   * Return the octet values array that represents the object
   * in ZMODEM binary encoding with a 32-bit CRC.
   *
   * @param {ZDLE} zencoder - A ZDLE instance to use for
   *      ZDLE encoding.
   *
   * @returns {number[]} An array of octet values suitable for sending
   *      as binary data.
   */
  to_binary32 (zencoder: any): number[] {
    return this._to_binary(zencoder, BINARY32_HEADER_PREFIX, CRC.crc32)
  }

  _to_binary (zencoder: any, prefix: number[], crcFunc: (data: number[]) => number[]): number[] {
    const toCrc = this._crc_bytes()
    // Both the 4-byte payload and the CRC bytes are ZDLE-encoded.
    const octets = prefix.concat(
      zencoder.encode(toCrc.concat(crcFunc(toCrc)))
    )

    return octets
  }

  _crc_bytes (): number[] {
    return [this.TYPENUM].concat(this._bytes4)
  }
}

export default ZmodemHeaderBase
