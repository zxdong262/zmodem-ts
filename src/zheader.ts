import ZMLIB from './zmlib'
import {
  ZPAD,
  ZBIN,
  ZBIN32,
  HEX_HEADER_PREFIX,
  BINARY16_HEADER_PREFIX,
  BINARY32_HEADER_PREFIX
} from './zheader-constants'

import {
  parseHex,
  parseBinary16,
  parseBinary32,
  FRAME_NAME_CREATOR,
  AnyClass
} from './zheader-functions2'

import ZmodemHeaderBase from './zheader-base'

/**
 * Class that represents a ZMODEM header.
 */
export class ZmodemHeader extends ZmodemHeaderBase {
  static trimLeadingGarbage (ibuffer: number[]): number [] {
    const garbage = []
    let discardAll = false
    let parser = null

    while ((ibuffer.length > 0) && parser === null) {
      const firstZPAD = ibuffer.indexOf(ZPAD)

      if (firstZPAD === -1) {
        discardAll = true
        break
      } else {
        garbage.push(...ibuffer.splice(0, firstZPAD))

        if (ibuffer.length < 2) {
          break
        } else if (ibuffer[1] === ZPAD) {
          if (ibuffer.length < HEX_HEADER_PREFIX.length) {
            if (ibuffer.join() === HEX_HEADER_PREFIX.slice(0, ibuffer.length).join()) {
              // We have an incomplete fragment that matches
              // HEX_HEADER_PREFIX. So don't trim any more.
              break
            }
          } else if (
            ibuffer[2] === HEX_HEADER_PREFIX[2] &&
            ibuffer[3] === HEX_HEADER_PREFIX[3]
          ) {
            parser = parseHex
          }
        } else if (ibuffer[1] === ZMLIB.ZDLE) {
          if (ibuffer.length < BINARY16_HEADER_PREFIX.length) {
            break
          }

          if (ibuffer[2] === BINARY16_HEADER_PREFIX[2]) {
            parser = parseBinary16
          } else if (ibuffer[2] === BINARY32_HEADER_PREFIX[2]) {
            parser = parseBinary32
          }
        }

        if (parser === null) {
          garbage.push(ibuffer.shift() as never)
        }
      }
    }

    if (discardAll) {
      garbage.push(...ibuffer.splice(0))
    }
    return garbage
  }

  static parse_hex (bytesArr: number[]): AnyClass | undefined {
    return parseHex(bytesArr)
  }

  static parse (octets: number[]): [AnyClass, number] | undefined {
    let hdr
    let d = 16
    if (octets[1] === ZPAD) {
      hdr = parseHex(octets)
    } else if (octets[2] === ZBIN) {
      hdr = parseBinary16(octets) // ?? original code is parseBinary16(octets, 3)
    } else if (octets[2] === ZBIN32) {
      hdr = parseBinary32(octets)
      d = 32
    }
    if (hdr !== undefined) {
      return [hdr, d]
    }
    if (octets.length < 3) {
      return
    }
    throw new Error(`Unrecognized/unsupported octets: ${octets.join()}`)
  }

  static build (name: string, ...args: any[]): AnyClass | undefined {
    const Ctr = FRAME_NAME_CREATOR[name]
    if (Ctr === undefined) {
      throw new Error(`No frame class "${name}" is defined!`)
    }

    const hdr = new (Ctr as any)(...args)

    return hdr
  }
}
