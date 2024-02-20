import ZMLIB from './zmlib'

export const ZPAD = '*'.charCodeAt(0)
export const ZBIN = 'A'.charCodeAt(0)
export const ZHEX = 'B'.charCodeAt(0)
export const ZBIN32 = 'C'.charCodeAt(0)

export const HEX_HEADER_CRLF = [0x0d, 0x0a]
export const HEX_HEADER_CRLF_XON = [...HEX_HEADER_CRLF, ZMLIB.XON]

export const HEX_HEADER_PREFIX = [ZPAD, ZPAD, ZMLIB.ZDLE, ZHEX]
export const BINARY16_HEADER_PREFIX = [ZPAD, ZMLIB.ZDLE, ZBIN]
export const BINARY32_HEADER_PREFIX = [ZPAD, ZMLIB.ZDLE, ZBIN32]

// Define the type for ZRINIT_FLAG and ZSINIT_FLAG
export interface FlagType {
  [key: string]: number
}

export const ZRINIT_FLAG: FlagType = {
  CANFDX: 0x01,
  CANOVIO: 0x02,
  CANBRK: 0x04,
  CANCRY: 0x08,
  CANLZW: 0x10,
  CANFC32: 0x20,
  ESCCTL: 0x40,
  ESC8: 0x80
}

export const ZSINIT_FLAG: FlagType = {
  ESCCTL: 0x40,
  ESC8: 0x80
}

// Define the type for ZRINIT_FLAG and ZSINIT_FLAG
interface JSONType {
  [key: string]: FlagType | any[]
}

export const ZFILE_VALUES: JSONType = {
  extended: {
    sparse: 0x40
  },

  transport: [
    undefined,
    'compress',
    'encrypt',
    'rle'
  ],

  management: [
    undefined,
    'newer_or_longer',
    'crc',
    'append',
    'clobber',
    'newer',
    'mtime_or_length',
    'protect',
    'rename'
  ],

  conversion: [
    undefined,
    'binary',
    'text',
    'resume'
  ]
}

export const ZFILE_ORDER = ['extended', 'transport', 'management', 'conversion']

export const ZMSKNOLOC = 0x80
export const MANAGEMENT_MASK = 0x1f
export const ZXSPARS = 0x40
