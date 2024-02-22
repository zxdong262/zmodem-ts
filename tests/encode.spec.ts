import { ZmodemEncodeLib } from '../src/encode' // Adjust the path to match your actual file location

describe('pack_u16_be', () => {
  it('should correctly pack a 16-bit number', () => {
    const packed = ZmodemEncodeLib.pack_u16_be(1234)
    expect(packed).toEqual([4, 210]) // Expected packed values
  })

  it('should throw an error if the number exceeds 16 bits', () => {
    expect(() => ZmodemEncodeLib.pack_u16_be(65536)).toThrowError(
      'Number cannot exceed 16 bits: 65536'
    )
  })
})
describe('pack_u32_le', () => {
  it('should correctly pack a 32-bit number', () => {
    const packed = ZmodemEncodeLib.pack_u32_le(12345678)
    expect(packed).toEqual([78, 185, 230, 0]) // Expected packed values
  })
})
describe('unpack_u16_be', () => {
  it('should correctly unpack a big-endian 16-bit number', () => {
    const unpacked = ZmodemEncodeLib.unpack_u16_be([4, 210])
    expect(unpacked).toBe(1234) // Expected unpacked value
  })
})
describe('unpack_u32_le', () => {
  it('should correctly unpack a little-endian 32-bit number', () => {
    const unpacked = ZmodemEncodeLib.unpack_u32_le([78, 185, 230, 0])
    expect(unpacked).toBe(12345678) // Expected unpacked value
  })
})
describe('octets_to_hex', () => {
  it('should convert octets to their hex representation', () => {
    const hex = ZmodemEncodeLib.octets_to_hex([15, 42, 128])
    expect(hex).toEqual([102, 97, 50]) // Expected hex values
  })
})
describe('parse_hex_octets', () => {
  it('should correctly parse hex octets', () => {
    const parsed = ZmodemEncodeLib.parse_hex_octets([102, 97, 50])
    expect(parsed).toEqual([15, 42, 128]) // Expected parsed values
  })
})
