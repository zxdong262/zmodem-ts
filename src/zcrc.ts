import { buf } from 'crc-32'
import { ZmodemEncodeLib } from './encode'
import ZmodemError from './zerror'

type OctetNumbers = number[]

const crcWidth = 16
const crcPolynomial = 0x1021
const crcCastMask = 0xffff
const crcMsbmask = 1 << (crcWidth - 1)

function computeCrcTab (): number[] {
  const crcTab = new Array(256)
  const divideShift = crcWidth - 8

  for (let divide = 0; divide < 256; divide++) {
    let currByte = (divide << divideShift) & crcCastMask

    for (let bit = 0; bit < 8; bit++) {
      if ((currByte & crcMsbmask) !== 0) {
        currByte <<= 1
        currByte ^= crcPolynomial
      } else {
        currByte <<= 1
      }
    }

    crcTab[divide] = currByte & crcCastMask
  }
  return crcTab
}

function updateCrc (cp: number, crc: number): number {
  const crcTab = computeCrcTab()
  return crcTab[((crc >> 8) & 255)] ^ ((255 & crc) << 8) ^ cp
}

function verify (expect: OctetNumbers, got: OctetNumbers): void {
  if (expect.join() !== got.join()) {
    throw new ZmodemError('crc', got, expect)
  }
}

const CRC = {
  crc16 (octetNums: OctetNumbers) {
    let crc = octetNums[0]
    for (let b = 1; b < octetNums.length; b++) {
      crc = updateCrc(octetNums[b], crc)
    }

    crc = updateCrc(0, updateCrc(0, crc))

    return ZmodemEncodeLib.pack_u16_be(crc)
  },
  crc32 (octetNums: OctetNumbers) {
    return ZmodemEncodeLib.pack_u32_le(
      buf(octetNums) >>> 0
    )
  },
  verify16 (bytesArr: OctetNumbers, got: OctetNumbers) {
    return verify(CRC.crc16(bytesArr), got)
  },
  verify32 (bytesArr: OctetNumbers, crc: OctetNumbers) {
    verify(CRC.crc32(bytesArr), crc)
  }
}

export default CRC
