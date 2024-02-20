
import { ZmodemEncodeLib } from './encode'
import CRC from './zcrc'
import ZmodemZDLE from './zdle'
import {
  BINARY16_HEADER_PREFIX,
  BINARY32_HEADER_PREFIX
} from './zheader-constants'

import {
  ZRQINIT_HEADER,
  ZRINIT_HEADER,
  ZSINIT_HEADER,
  ZACK_HEADER,
  ZFILE_HEADER,
  ZSKIP_HEADER,
  ZABORT_HEADER,
  ZFIN_HEADER,
  ZFERR_HEADER,
  ZOffsetHeader,
  ZRPOS_HEADER,
  ZDATA_HEADER,
  ZEOF_HEADER
} from './zheader-class'

export type AnyClass = typeof ZRQINIT_HEADER | typeof ZRINIT_HEADER | typeof ZSINIT_HEADER | typeof ZACK_HEADER | typeof ZFILE_HEADER | typeof ZSKIP_HEADER | typeof ZABORT_HEADER | typeof ZFIN_HEADER | typeof ZFERR_HEADER | typeof ZRPOS_HEADER | typeof ZDATA_HEADER | typeof ZEOF_HEADER

interface FrameClassType {
  header: AnyClass
  name: string
}

const FRAME_CLASS_TYPES: Array<FrameClassType | undefined> = [
  { header: ZRQINIT_HEADER, name: 'ZRQINIT' },
  { header: ZRINIT_HEADER, name: 'ZRINIT' },
  { header: ZSINIT_HEADER, name: 'ZSINIT' },
  { header: ZACK_HEADER, name: 'ZACK' },
  { header: ZFILE_HEADER, name: 'ZFILE' },
  { header: ZSKIP_HEADER, name: 'ZSKIP' },
  undefined, // [ ZNAK_HEADER, "ZNAK" ],
  { header: ZABORT_HEADER, name: 'ZABORT' },
  { header: ZFIN_HEADER, name: 'ZFIN' },
  { header: ZRPOS_HEADER, name: 'ZRPOS' },
  { header: ZDATA_HEADER, name: 'ZDATA' },
  { header: ZEOF_HEADER, name: 'ZEOF' },
  { header: ZFERR_HEADER, name: 'ZFERR' }, // see note
  undefined, // [ ZCRC_HEADER, "ZCRC" ],
  undefined, // [ ZCHALLENGE_HEADER, "ZCHALLENGE" ],
  undefined, // [ ZCOMPL_HEADER, "ZCOMPL" ],
  undefined, // [ ZCAN_HEADER, "ZCAN" ],
  undefined, // [ ZFREECNT_HEADER, "ZFREECNT" ],
  undefined, // [ ZCOMMAND_HEADER, "ZCOMMAND" ],
  undefined // [ ZSTDERR_HEADER, "ZSTDERR" ],
]
/*
ZFERR is described as “error in reading or writing file”. It’s really
not a good idea from a security angle for the endpoint to expose this
information. We should parse this and handle it as ZABORT but never send it.

Likewise with ZFREECNT: the sender shouldn’t ask how much space is left
on the other box rather, the receiver should decide what to do with the
file size as the sender reports it.
*/
interface Creator {
  [key: string]: AnyClass
}

const FRAME_NAME_CREATOR0: Creator = {}

const len = FRAME_CLASS_TYPES.length
for (let fc = 0; fc < len; fc++) {
  if (FRAME_CLASS_TYPES[fc] == null) {
    continue
  }
  const v = FRAME_CLASS_TYPES[fc] as FrameClassType
  const Cls = v.header
  FRAME_NAME_CREATOR0[v.name] = Cls
}
export const FRAME_NAME_CREATOR: Creator = FRAME_NAME_CREATOR0

// ----------------------------------------------------------------------

const CREATORS = [
  ZRQINIT_HEADER,
  ZRINIT_HEADER,
  ZSINIT_HEADER,
  ZACK_HEADER,
  ZFILE_HEADER,
  ZSKIP_HEADER,
  'ZNAK',
  ZABORT_HEADER,
  ZFIN_HEADER,
  ZRPOS_HEADER,
  ZDATA_HEADER,
  ZEOF_HEADER,
  ZFERR_HEADER,
  'ZCRC', // ZCRC_HEADER, -- leaving unimplemented?
  'ZCHALLENGE',
  'ZCOMPL',
  'ZCAN',
  'ZFREECNT', // ZFREECNT_HEADER,
  'ZCOMMAND',
  'ZSTDERR'
]

export function getBlankHeader (typenum: number): AnyClass {
  const creator = CREATORS[typenum]
  if (typeof (creator) === 'string') {
    throw new Error('Received unsupported header: ' + creator)
  }

  /*
  if (creator === ZCRC_HEADER) {
      return new creator([0, 0, 0, 0])
  }
  */

  return getBlankHeaderFromConstructor(creator)
}

function doesClassExtend (baseClass: any, superClass: any): boolean {
  if (baseClass === superClass) return true

  let currentPrototype = Object.getPrototypeOf(baseClass.prototype)

  while (currentPrototype instanceof Object) {
    if (currentPrototype.constructor === superClass) {
      return true
    }
    currentPrototype = Object.getPrototypeOf(currentPrototype)
  }

  return false
}

// referenced outside TODO
export function getBlankHeaderFromConstructor (Creator: AnyClass): AnyClass {
  if (doesClassExtend(Creator, ZOffsetHeader)) {
    return new (Creator as any)(0)
  }
  return new (Creator as any)([])
}

export function parseBinary16 (bytesArr: number[]): AnyClass | undefined {
  // The max length of a ZDLE-encoded binary header w/ 16-bit CRC is:
  //  3 initial bytes, NOT ZDLE-encoded
  //  2 typenum bytes     (1 decoded)
  //  8 data bytes        (4 decoded)
  //  4 CRC bytes         (2 decoded)

  // A 16-bit payload has 7 ZDLE-encoded octets.
  // The ZDLE-encoded octets follow the initial prefix.
  const zdleDecoded = ZmodemZDLE.splice(bytesArr, BINARY16_HEADER_PREFIX.length, 7)
  if (zdleDecoded !== undefined) {
    return parseNonZdleBinary16(zdleDecoded)
  }
}

export function parseNonZdleBinary16 (decoded: number[]): AnyClass {
  CRC.verify16(
    decoded.slice(0, 5),
    decoded.slice(5)
  )

  const typenum = decoded[0]
  const hdr = getBlankHeader(typenum) as any
  hdr._bytes4 = decoded.slice(1, 5)

  return hdr
}

export function parseBinary32 (bytesArr: number[]): AnyClass | undefined {
  // Same deal as with 16-bit CRC except there are two more
  // potentially ZDLE-encoded bytes, for a total of 9.
  const zdleDecoded = ZmodemZDLE.splice(
    bytesArr, // omit the leading "*", ZDLE, and "C"
    BINARY32_HEADER_PREFIX.length,
    9
  )

  if (zdleDecoded === undefined) {
    return
  }

  CRC.verify32(
    zdleDecoded.slice(0, 5),
    zdleDecoded.slice(5)
  )

  const typenum = zdleDecoded[0]
  const hdr = getBlankHeader(typenum) as any
  hdr._bytes4 = zdleDecoded.slice(1, 5)
  return hdr
}

export function parseHex (bytesArr: number[]): AnyClass | undefined {
  // A hex header always has:
  //  4 bytes for the ** . ZDLE . 'B'
  //  2 hex bytes for the header type
  //  8 hex bytes for the header content
  //  4 hex bytes for the CRC
  //  1-2 bytes for (CR/)LF
  //  (...and at this point the trailing XON is already stripped)
  //
  // ----------------------------------------------------------------------
  // A carriage return and line feed are sent with HEX headers.  The
  // receive routine expects to see at least one of these characters, two
  // if the first is CR.
  // ----------------------------------------------------------------------
  //
  // ^^ I guess it can be either CR/LF or just LF … though those two
  // sentences appear to be saying contradictory things.
  let lfPos = bytesArr.indexOf(0x8a) // lrzsz sends this

  if (lfPos === -1) {
    lfPos = bytesArr.indexOf(0x0a)
  }

  let hdrErr = ''
  let hexBytes

  if (lfPos === -1) {
    if (bytesArr.length > 11) {
      hdrErr = 'Invalid hex header - no LF detected within 12 bytes!'
    }

    // incomplete header
    return
  } else {
    hexBytes = bytesArr.splice(0, lfPos)

    // Trim off the LF
    bytesArr.shift()

    if (hexBytes.length === 19) {
      // NB: The spec says CR but seems to treat high-bit variants
      // of control characters the same as the regulars should we
      // also allow 0x8d?
      const preceding = hexBytes.pop()
      if (preceding !== 0x0d && preceding !== 0x8d) {
        hdrErr = 'Invalid hex header: (CR/)LF doesn’t have CR!'
      }
    } else if (hexBytes.length !== 18) {
      hdrErr = 'Invalid hex header: invalid number of bytes before LF!'
    }
  }

  if (hdrErr !== '') {
    hdrErr += ` ( ${hexBytes.length} bytes: ${hexBytes.join()} )`
    throw new Error(hdrErr)
  }

  hexBytes.splice(0, 4)

  // Should be 7 bytes ultimately:
  //  1 for typenum
  //  4 for header data
  //  2 for CRC
  const octets = ZmodemEncodeLib.parse_hex_octets(hexBytes)
  return parseNonZdleBinary16(octets)
}
