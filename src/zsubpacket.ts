import ZMLIB from './zmlib'
import CRC from './zcrc'
import ZmodemZDLE from './zdle'

const ZCRCE = 0x68
const ZCRCG = 0x69
const ZCRCQ = 0x6a
const ZCRCW = 0x6b

interface SubpacketType {
  [key: string]: AnyClass
}

interface SubpacketType1 {
  [key: number]: AnyClass
}

type AnyClass =
  | typeof ZEndNoAckSubpacket
  | typeof ZEndAckSubpacket
  | typeof ZNoEndNoAckSubpacket
  | typeof ZNoEndAckSubpacket

class ZmodemSubpacketBase {
  _frameendNum = 0
  _payload: number[] = []

  constructor (payload: number[]) {
    this._payload = payload
  }

  encode16 (zencoder: ZmodemZDLE): number[] {
    return this._encode(zencoder, CRC.crc16)
  }

  encode32 (zencoder: ZmodemZDLE): number[] {
    return this._encode(zencoder, CRC.crc32)
  }

  getPayload (): number[] {
    return this._payload
  }

  _encode (zencoder: ZmodemZDLE, crcFunc: Function): any[] {
    return [
      ...zencoder.encode(this._payload.slice(0)),
      ZMLIB.ZDLE,
      this._frameendNum,
      ...zencoder.encode(crcFunc([...this._payload, this._frameendNum]))
    ]
  }

  ackExpected (): boolean { return false }

  frame_end (): boolean { return false }
}

class ZEndSubpacketBase extends ZmodemSubpacketBase {
  frame_end (): boolean {
    return true
  }
}
class ZNoEndSubpacketBase extends ZmodemSubpacketBase {
  frame_end (): boolean {
    return false
  }
}

class ZEndNoAckSubpacket extends ZEndSubpacketBase {
  _frameendNum = ZCRCE
  ackExpected (): boolean {
    return false
  }
}

class ZEndAckSubpacket extends ZEndSubpacketBase {
  _frameendNum = ZCRCW
  ackExpected (): boolean {
    return true
  }
}

class ZNoEndNoAckSubpacket extends ZNoEndSubpacketBase {
  _frameendNum = ZCRCG
  ackExpected (): boolean {
    return false
  }
}

class ZNoEndAckSubpacket extends ZNoEndSubpacketBase {
  _frameendNum = ZCRCQ
  ackExpected (): boolean {
    return true
  }
}

const SUBPACKET_BUILDER: SubpacketType = {
  end_no_ack: ZEndNoAckSubpacket,
  end_ack: ZEndAckSubpacket,
  no_end_no_ack: ZNoEndNoAckSubpacket,
  no_end_ack: ZNoEndAckSubpacket
}

class ZmodemSubpacket extends ZmodemSubpacketBase {
  static build (octets: number[], frameend: string): AnyClass {
    const Ctr = SUBPACKET_BUILDER[frameend]
    if (Ctr === undefined) {
      throw new Error(`No subpacket type “${frameend}” is defined! Try one of: ${Object.keys(
        SUBPACKET_BUILDER
      ).join(', ')}`)
    }
    return new Ctr(octets) as any
  }

  static parse16 (octets: number[]): AnyClass | undefined {
    return ZmodemSubpacket._parse(octets, 2)
  }

  static parse32 (octets: number[]): AnyClass | undefined {
    return ZmodemSubpacket._parse(octets, 4)
  }

  static _parse (bytesArr: number[], crcLen: number): AnyClass | undefined {
    let endAt = 0
    let Creator

    const _frameEndsLookup: SubpacketType1 = {
      104: ZEndNoAckSubpacket,
      105: ZNoEndNoAckSubpacket,
      106: ZNoEndAckSubpacket,
      107: ZEndAckSubpacket
    }

    let zdleAt = 0
    while (zdleAt < bytesArr.length) {
      zdleAt = bytesArr.indexOf(ZMLIB.ZDLE, zdleAt)
      if (zdleAt === -1) return

      const afterZdle = bytesArr[zdleAt + 1]
      Creator = _frameEndsLookup[afterZdle]
      if (Creator !== undefined) {
        endAt = zdleAt + 1
        break
      }

      zdleAt++
    }

    if (Creator == null) return

    const frameendNum = bytesArr[endAt]

    if (bytesArr[endAt - 1] !== ZMLIB.ZDLE) {
      throw new Error(`Byte before frame end should be ZDLE, not ${bytesArr[endAt - 1]}`)
    }

    const zdleEncodedPayload = bytesArr.splice(0, endAt - 1)

    const gotCrc = ZmodemZDLE.splice(bytesArr, 2, crcLen)
    if (gotCrc == null) {
      // Restore the payload bytes without using unshift.apply which could overflow
      // for large payloads
      const restored = zdleEncodedPayload.concat(bytesArr.splice(0))
      bytesArr.length = 0
      for (let i = 0; i < restored.length; i++) {
        bytesArr[i] = restored[i]
      }

      return
    }

    const payload = ZmodemZDLE.decode(zdleEncodedPayload)

    CRC[crcLen === 2 ? 'verify16' : 'verify32'](
      [...payload, frameendNum],
      gotCrc
    )

    return new Creator(payload) as any
  }

  frame_end (): boolean { return false }
}

export default ZmodemSubpacket
