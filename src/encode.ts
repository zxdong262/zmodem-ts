import { N } from './types'
const HEX_DIGITS: number[] = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102]

const HEX_OCTET_VALUE: N = {}
for (let hd = 0; hd < HEX_DIGITS.length; hd++) {
  HEX_OCTET_VALUE[HEX_DIGITS[hd]] = hd
}

export const ZmodemEncodeLib = {
  /**
   * Pack a 16-bit number to big-endian format.
   *
   * @param {number} number - The number to pack.
   *
   * @returns {number[]} The packed values.
   */
  pack_u16_be (number: number): number[] {
    if (number > 0xffff) throw new Error(`Number cannot exceed 16 bits: ${number}`)

    return [number >> 8, number & 0xff]
  },

  /**
   * Pack a 32-bit number to little-endian format.
   *
   * @param {number} number - The number to pack.
   *
   * @returns {number[]} The packed values.
   */
  pack_u32_le (number: number): number[] {
    const highBytes = number / 65536

    return [
      number & 0xff,
      (number & 65535) >> 8,
      highBytes & 0xff,
      highBytes >> 8
    ]
  },

  /**
   * Unpack a big-endian 16-bit number.
   *
   * @param {number[]} bytesArr - An array with two 8-bit numbers.
   *
   * @returns {number} The unpacked value.
   */
  unpack_u16_be (bytesArr: number[]): number {
    return (bytesArr[0] << 8) + bytesArr[1]
  },

  /**
   * Unpack a little-endian 32-bit number.
   *
   * @param {number[]} octets - An array with four 8-bit numbers.
   *
   * @returns {number} The unpacked value.
   */
  unpack_u32_le (octets: number[]): number {
    return octets[0] + (octets[1] << 8) + (octets[2] << 16) + (octets[3] * 16777216)
  },

  /**
   * Convert a series of octets to their hex
   * representation.
   *
   * @param {number[]} octets - The octet values.
   *
   * @returns {number[]} The hex values of the octets.
   */
  octets_to_hex (octets: number[]): number[] {
    const hex: number[] = []
    for (let o = 0; o < octets.length; o++) {
      hex.push(
        (HEX_DIGITS[octets[o] >> 4]) as never,
        HEX_DIGITS[octets[o] & 0x0f] as never
      )
    }
    return hex
  },

  /**
   * The inverse of octets_to_hex(): takes an array
   * of hex octet pairs and returns their octet values.
   *
   * @param {number[]} hex_octets - The hex octet values.
   *
   * @returns {number[]} The parsed octet values.
   */
  parse_hex_octets (hexOctets: number[]): number[] {
    const octets = new Array(hexOctets.length / 2)
    for (let i = 0; i < octets.length; i++) {
      octets[i] = (HEX_OCTET_VALUE[hexOctets[2 * i]] << 4) + HEX_OCTET_VALUE[hexOctets[1 + 2 * i]]
    }
    return octets
  }
}
