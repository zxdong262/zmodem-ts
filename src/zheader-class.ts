
import { ZmodemEncodeLib } from './encode'
import { Obj } from './types'
import {
  FlagType,
  HEX_HEADER_CRLF,
  ZRINIT_FLAG,
  ZSINIT_FLAG,
  ZFILE_VALUES,
  ZFILE_ORDER,
  ZMSKNOLOC,
  MANAGEMENT_MASK,
  ZXSPARS
} from './zheader-constants'
import {
  getZRINITFlagNum,
  getZSINITFlagNum
} from './zheader-functions'

import ZmodemHeaderBase from './zheader-base'

// every {name}_HEADER class add a NAME = '{name}' prototype
export class ZRQINIT_HEADER extends ZmodemHeaderBase {
  NAME = 'ZRQINIT'
  TYPENUM = 0
}

export class ZRINIT_HEADER extends ZmodemHeaderBase {
  constructor (flagsArr: any[], bufsize: number = 0) {
    super()
    let flagsNum = 0

    flagsArr.forEach(function (fl) {
      flagsNum |= getZRINITFlagNum(fl)
    })

    this._bytes4 = [
      bufsize & 0xff,
      bufsize >> 8,
      0,
      flagsNum
    ]
  }

  NAME = 'ZRINIT'
  TYPENUM = 1
  // undefined if nonstop I/O is allowed
  get_buffer_size (): number | undefined {
    const r = ZmodemEncodeLib.unpack_u16_be(this._bytes4.slice(0, 2))
    if (r === 0) {
      return undefined
    }
    return r
  }

  can_full_duplex (): boolean {
    return Boolean(this._bytes4[3] & ZRINIT_FLAG.CANFDX)
  }

  can_overlap_io (): boolean {
    return Boolean(this._bytes4[3] & ZRINIT_FLAG.CANOVIO)
  }

  can_break (): boolean {
    return Boolean(this._bytes4[3] & ZRINIT_FLAG.CANBRK)
  }

  can_fcs_32 (): boolean {
    return Boolean(this._bytes4[3] & ZRINIT_FLAG.CANFC32)
  }

  escape_ctrl_chars (): boolean {
    return Boolean(this._bytes4[3] & ZRINIT_FLAG.ESCCTL)
  }

  // Is this used? I don’t see it used in lrzsz or syncterm
  // Looks like it was a “foreseen” feature that Forsberg
  // never implemented. (The need for it went away, maybe?)
  escape_8th_bit (): boolean {
    return Boolean(this._bytes4[3] & ZRINIT_FLAG.ESC8)
  }
}

export class ZSINIT_HEADER extends ZmodemHeaderBase {
  NAME = 'ZSINIT'
  TYPENUM = 2
  _data: any[] = []
  constructor (flagsArr: any[], attnSeqArr?: any[]) {
    super()
    let flagsNum = 0

    flagsArr.forEach(function (fl) {
      flagsNum |= getZSINITFlagNum(fl)
    })

    this._bytes4 = [0, 0, 0, flagsNum]

    if (attnSeqArr != null) {
      if (attnSeqArr.length > 31) {
        throw new Error('Attn sequence must be <= 31 bytes')
      }
      if (attnSeqArr.some(function (num) { return num > 255 })) {
        throw new Error(`Attn sequence ( ${attnSeqArr.join(',')} ) must be <256`)
      }
      this._data = attnSeqArr.concat([0])
    }
  }

  escape_ctrl_chars (): boolean {
    return Boolean(this._bytes4[3] & ZSINIT_FLAG.ESCCTL)
  }

  // Is this used? I don’t see it used in lrzsz or syncterm
  escape_8th_bit (): boolean {
    return Boolean(this._bytes4[3] & ZSINIT_FLAG.ESC8)
  }
}

export class ZACK_HEADER extends ZmodemHeaderBase {
  _hex_header_ending = HEX_HEADER_CRLF
  constructor (payload4?: any[]) {
    super()

    if (payload4 != null) {
      this._bytes4 = payload4.slice()
    }
  }

  NAME = 'ZACK'
  TYPENUM = 3
}

export class ZFILE_HEADER extends ZmodemHeaderBase {
  // TODO: allow options on instantiation
  NAME = 'ZFILE'
  TYPENUM = 4
  get_options (): Obj {
    const opts: Obj = {
      sparse: Boolean(this._bytes4[0] & ZXSPARS)
    }

    const bytesCopy = this._bytes4.slice(0)

    ZFILE_ORDER.forEach((key, i) => {
      if (Array.isArray(ZFILE_VALUES[key])) {
        if (key === 'management') {
          opts.skip_if_absent = Boolean(bytesCopy[i] & ZMSKNOLOC)
          bytesCopy[i] &= MANAGEMENT_MASK
        }
        const arr: any[] = ZFILE_VALUES[key] as any[]
        opts[key] = arr[bytesCopy[i]]
      } else {
        for (const extkey in ZFILE_VALUES[key]) {
          const v = Boolean(bytesCopy[i] & (ZFILE_VALUES[key] as FlagType)[extkey])
          opts[extkey] = v
          if (v) {
            bytesCopy[i] ^= (ZFILE_VALUES[key] as FlagType)[extkey]
          }
        }
      }

      if (opts[key] === undefined && bytesCopy[i] !== undefined) {
        opts[key] = `unknown:${bytesCopy[i]}`
      }
    })

    return opts
  }
}

// ----------------------------------------------------------------------

// Empty headers - in addition to ZRQINIT
export class ZSKIP_HEADER extends ZmodemHeaderBase {
  NAME = 'ZSKIP'
  TYPENUM = 5
}
// No need for ZNAK
export class ZABORT_HEADER extends ZmodemHeaderBase {
  NAME = 'ZABORT'
  TYPENUM = 7
}
export class ZFIN_HEADER extends ZmodemHeaderBase {
  NAME = 'ZFIN'
  TYPENUM = 8
}
export class ZFERR_HEADER extends ZmodemHeaderBase {
  _hex_header_ending = HEX_HEADER_CRLF
  NAME = 'ZFERR'
  TYPENUM = 11
}

export class ZOffsetHeader extends ZmodemHeaderBase {
  constructor (offset: number) {
    super()
    this._bytes4 = ZmodemEncodeLib.pack_u32_le(offset)
  }

  get_offset (): number {
    return ZmodemEncodeLib.unpack_u32_le(this._bytes4)
  }
}

export class ZRPOS_HEADER extends ZOffsetHeader {
  NAME = 'ZRPOS'
  TYPENUM = 9
}
export class ZDATA_HEADER extends ZOffsetHeader {
  NAME = 'ZDATA'
  TYPENUM = 10
}
export class ZEOF_HEADER extends ZOffsetHeader {
  NAME = 'ZEOF'
  TYPENUM = 11
}
