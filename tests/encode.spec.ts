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
    const testCases = [
      { input: 0, expected: [0, 0, 0, 0] },
      { input: 1, expected: [1, 0, 0, 0] },
      { input: 256, expected: [0, 1, 0, 0] },
      { input: 65536, expected: [0, 0, 1, 0] },
      { input: 4294967295, expected: [255, 255, 255, 255] }
    ]

    for (const testCase of testCases) {
      const result = ZmodemEncodeLib.pack_u32_le(testCase.input)
      console.log(testCase.input, result)
      expect(result).toEqual(testCase.expected)
    }
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
    const testCases = [
      { expected: 0, input: [0, 0, 0, 0] },
      { expected: 1, input: [1, 0, 0, 0] },
      { expected: 256, input: [0, 1, 0, 0] },
      { expected: 65536, input: [0, 0, 1, 0] },
      { expected: 4294967295, input: [255, 255, 255, 255] }
    ]

    for (const testCase of testCases) {
      const result = ZmodemEncodeLib.unpack_u32_le(testCase.input)
      console.log(testCase.input, result)
      expect(result).toEqual(testCase.expected)
    }
  })
})
describe('octets_to_hex', () => {
  it('should convert octets to their hex representation', () => {
    const hex = ZmodemEncodeLib.octets_to_hex([0, 1, 2, 3])
    expect(hex).toEqual([
      48, 48, 48, 49,
      48, 50, 48, 51
    ]) // Expected hex values
  })
})
describe('parse_hex_octets', () => {
  it('should correctly parse hex octets', () => {
    const parsed = ZmodemEncodeLib.parse_hex_octets([
      48, 48, 48, 49,
      48, 50, 48, 51
    ])
    expect(parsed).toEqual([0, 1, 2, 3]) // Expected parsed values
  })
})
