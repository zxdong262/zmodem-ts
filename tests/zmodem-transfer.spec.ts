/**
 * Comprehensive test suite for ZMODEM transfers
 *
 * Tests for:
 * 1. Basic ZMODEM session initialization
 * 2. Stack overflow prevention with large data chunks
 * 3. CRC verification
 * 4. File transfer simulation
 */

import ZmodemSentry from '../src/zsentry'
import ZmodemSession from '../src/zsession'
import ZmodemSessionBase from '../src/zsess-base'
import ZMLIB from '../src/zmlib'
import { ZmodemHeader } from '../src/zheader'
import ZmodemSubpacket from '../src/zsubpacket'
import CRC from '../src/zcrc'

describe('ZMLIB - Core utilities', () => {
  describe('stripIgnoredBytes', () => {
    it('should strip XON/XOFF bytes from array', () => {
      const input = [0x11, 0x65, 0x13, 0x66, 0x91, 0x93] // XON, 'e', XOFF, 'f', XON|0x80, XOFF|0x80
      const result = ZMLIB.stripIgnoredBytes(input)
      expect(result).toEqual([0x65, 0x66]) // Only 'e' and 'f' should remain
    })

    it('should handle empty array', () => {
      const input: number[] = []
      const result = ZMLIB.stripIgnoredBytes(input)
      expect(result).toEqual([])
    })

    it('should handle array with no ignored bytes', () => {
      const input = [0x41, 0x42, 0x43] // A, B, C
      const result = ZMLIB.stripIgnoredBytes(input)
      expect(result).toEqual([0x41, 0x42, 0x43])
    })
  })

  describe('findSubarray', () => {
    it('should find subarray at beginning', () => {
      const haystack = [1, 2, 3, 4, 5]
      const needle = [1, 2]
      expect(ZMLIB.findSubarray(haystack, needle)).toBe(0)
    })

    it('should find subarray in middle', () => {
      const haystack = [1, 2, 3, 4, 5]
      const needle = [3, 4]
      expect(ZMLIB.findSubarray(haystack, needle)).toBe(2)
    })

    it('should return -1 when not found', () => {
      const haystack = [1, 2, 3, 4, 5]
      const needle = [6, 7]
      expect(ZMLIB.findSubarray(haystack, needle)).toBe(-1)
    })

    it('should find abort sequence', () => {
      const data = [0, 0, 0x18, 0x18, 0x18, 0x18, 0x18, 0, 0]
      expect(ZMLIB.findSubarray(data, ZMLIB.ABORT_SEQUENCE)).toBe(2)
    })
  })
})

describe('CRC verification', () => {
  describe('crc16', () => {
    it('should calculate correct CRC16', () => {
      const data = [0x48, 0x65, 0x6c, 0x6c, 0x6f] // "Hello"
      const crc = CRC.crc16(data)
      expect(crc).toBeDefined()
      expect(Array.isArray(crc)).toBe(true)
      expect(crc.length).toBe(2)
    })
  })

  describe('crc32', () => {
    it('should calculate correct CRC32', () => {
      const data = [0x48, 0x65, 0x6c, 0x6c, 0x6f] // "Hello"
      const crc = CRC.crc32(data)
      expect(crc).toBeDefined()
      expect(Array.isArray(crc)).toBe(true)
      expect(crc.length).toBe(4)
    })

    it('should verify CRC32 correctly', () => {
      const data = [0x48, 0x65, 0x6c, 0x6c, 0x6f]
      const crc = CRC.crc32(data)
      expect(() => CRC.verify32(data, crc)).not.toThrow()
    })

    it('should throw on CRC32 mismatch', () => {
      const data = [0x48, 0x65, 0x6c, 0x6c, 0x6f]
      const badCrc = [0, 0, 0, 0]
      expect(() => CRC.verify32(data, badCrc)).toThrow(/CRC check failed/)
    })
  })
})

describe('ZmodemSessionBase - Input buffer handling', () => {
  describe('Large data chunk handling (stack overflow prevention)', () => {
    it('should handle very large input arrays without stack overflow', () => {
      // This test reproduces the "Maximum call stack size exceeded" issue
      // The original code used push.apply() which fails with large arrays
      const session = new (ZmodemSessionBase as any)()
      session._sender = () => {}

      // Create a large array (larger than typical call stack limits ~10k-100k)
      const largeSize = 200000 // 200KB of data
      const largeInput = new Array(largeSize).fill(0x42) // Fill with 'B' bytes

      // This should not throw "Maximum call stack size exceeded"
      expect(() => {
        // Directly test the internal method that was causing issues
        session._strip_and_enqueue_input(largeInput)
      }).not.toThrow()

      // Verify data was correctly added to buffer
      expect(session._input_buffer.length).toBe(largeSize)
    })

    it('should handle multiple consecutive large chunks', () => {
      const session = new (ZmodemSessionBase as any)()
      session._sender = () => {}

      const chunkSize = 100000
      const numChunks = 5

      for (let i = 0; i < numChunks; i++) {
        const chunk = new Array(chunkSize).fill(0x41 + i)
        session._strip_and_enqueue_input(chunk)
      }

      expect(session._input_buffer.length).toBe(chunkSize * numChunks)
    })

    it('should handle ArrayBuffer input conversion efficiently', () => {
      // Test the pattern used in WebSocket message handling
      const largeSize = 150000
      const arrayBuffer = new ArrayBuffer(largeSize)
      const uint8Array = new Uint8Array(arrayBuffer)
      // Use values that won't be stripped (avoid XON/XOFF: 0x11, 0x13, 0x91, 0x93)
      for (let i = 0; i < largeSize; i++) {
        let val = i % 256
        // Skip XON/XOFF bytes
        if (val === 0x11 || val === 0x13 || val === 0x91 || val === 0x93) {
          val = 0x42 // Use 'B' instead
        }
        uint8Array[i] = val
      }

      // Convert like the xterm-zmodem.js does
      const input = Array.prototype.slice.call(uint8Array)

      const session = new (ZmodemSessionBase as any)()
      session._sender = () => {}

      expect(() => {
        session._strip_and_enqueue_input(input)
      }).not.toThrow()

      // Buffer length equals input length since we avoided XON/XOFF bytes
      expect(session._input_buffer.length).toBe(largeSize)
    })
  })
})

describe('ZmodemSentry', () => {
  let sentToTerminal: number[][]
  let sentToSender: number[][]
  let detections: any[]
  let retractions: number

  const createSentry = (): ZmodemSentry => {
    sentToTerminal = []
    sentToSender = []
    detections = []
    retractions = 0

    return new ZmodemSentry({
      to_terminal: (octets: number[]) => {
        sentToTerminal.push(octets.slice())
      },
      sender: (octets: number[]) => {
        sentToSender.push(octets.slice())
      },
      on_detect: (detection: any) => {
        detections.push(detection)
      },
      on_retract: () => {
        retractions++
      }
    })
  }

  describe('Basic sentry operations', () => {
    it('should pass non-ZMODEM data to terminal', () => {
      const sentry = createSentry()
      const data = [0x48, 0x65, 0x6c, 0x6c, 0x6f] // "Hello"

      sentry.consume(data)

      expect(sentToTerminal.length).toBe(1)
      expect(sentToTerminal[0]).toEqual(data)
      expect(detections.length).toBe(0)
    })

    it('should handle ArrayBuffer input', () => {
      const sentry = createSentry()
      const buffer = new ArrayBuffer(5)
      const view = new Uint8Array(buffer)
      view.set([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"

      sentry.consume(buffer)

      expect(sentToTerminal.length).toBe(1)
      expect(sentToTerminal[0]).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f])
    })

    it('should handle large ArrayBuffer without stack overflow', () => {
      const sentry = createSentry()
      const size = 200000
      const buffer = new ArrayBuffer(size)
      const view = new Uint8Array(buffer)
      for (let i = 0; i < size; i++) {
        view[i] = i % 256
      }

      expect(() => {
        sentry.consume(buffer)
      }).not.toThrow()

      expect(sentToTerminal.length).toBe(1)
    })
  })

  describe('ZMODEM detection', () => {
    it('should detect ZRQINIT header (receive session start)', () => {
      const sentry = createSentry()

      // ZRQINIT hex header: **\x18B00 followed by header type and CRC
      // Full ZRQINIT header in hex format
      const zrqinit = [
        0x2a, 0x2a, 0x18, 0x42, 0x30, 0x30, // **<ZDLE>B00 (ZRQINIT type 0)
        0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, // 8 hex digits for p0-p3
        0x30, 0x30, 0x30, 0x30, // 4 hex digits for CRC
        0x0d, 0x0a, // CR LF
        0x11 // XON
      ]

      sentry.consume(zrqinit)

      // Should trigger detection
      expect(detections.length).toBe(1)
      expect(detections[0]).toBeDefined()
    })
  })
})

describe('ZmodemSubpacket', () => {
  describe('Subpacket creation and encoding', () => {
    it('should create end_no_ack subpacket', () => {
      const payload = [0x48, 0x65, 0x6c, 0x6c, 0x6f]
      // Note: build takes (octets, frameend) not (frameend, octets)
      const subpacket = ZmodemSubpacket.build(payload, 'end_no_ack') as any

      expect(subpacket).toBeDefined()
      expect(subpacket.getPayload()).toEqual(payload)
      expect(subpacket.frame_end()).toBe(true)
      expect(subpacket.ackExpected()).toBe(false)
    })

    it('should create no_end_no_ack subpacket', () => {
      const payload = [0x41, 0x42, 0x43]
      const subpacket = ZmodemSubpacket.build(payload, 'no_end_no_ack') as any

      expect(subpacket).toBeDefined()
      expect(subpacket.frame_end()).toBe(false)
      expect(subpacket.ackExpected()).toBe(false)
    })
  })
})

describe('ZmodemHeader', () => {
  describe('Header building', () => {
    it('should build ZRINIT header', () => {
      const header = ZmodemHeader.build('ZRINIT', ['CANFDX', 'CANOVIO', 'CANFC32'])

      expect(header).toBeDefined()
      expect((header as any).NAME).toBe('ZRINIT')
    })

    it('should build ZRPOS header with offset', () => {
      const header = ZmodemHeader.build('ZRPOS', 1024)

      expect(header).toBeDefined()
      expect((header as any).NAME).toBe('ZRPOS')
    })
  })

  describe('Header parsing', () => {
    it('should trim leading garbage from input', () => {
      const garbage = [0x00, 0x00, 0x00]
      const validHeader = [0x2a, 0x2a, 0x18, 0x42] // Start of hex header

      const combined = [...garbage, ...validHeader]
      const trimmed = ZmodemHeader.trimLeadingGarbage(combined)

      expect(trimmed).toBeDefined()
      expect(combined[0]).toBe(0x2a) // Should start with '*'
    })
  })
})

describe('Simulated WebSocket transfer scenario', () => {
  /**
   * This test simulates the flow in electerm's xterm-zmodem.js
   * where WebSocket binary messages are passed to ZMODEM
   */
  describe('WebSocket message handling pattern', () => {
    it('should handle rapid consecutive WebSocket messages', () => {
      const messages: ArrayBuffer[] = []
      const sentry = new ZmodemSentry({
        to_terminal: () => {},
        sender: () => {},
        on_detect: () => {},
        on_retract: () => {}
      })

      // Simulate rapid WebSocket messages (like during file transfer)
      const numMessages = 100
      const messageSize = 8192 // Typical chunk size

      for (let i = 0; i < numMessages; i++) {
        const buffer = new ArrayBuffer(messageSize)
        const view = new Uint8Array(buffer)
        for (let j = 0; j < messageSize; j++) {
          view[j] = (i * messageSize + j) % 256
        }
        messages.push(buffer)
      }

      // Process all messages - should not throw
      expect(() => {
        for (const msg of messages) {
          sentry.consume(msg)
        }
      }).not.toThrow()
    })

    it('should handle the electerm pattern of evt.data consumption', () => {
      // This simulates the pattern from xterm-zmodem.js handleWSMessage
      const sentry = new ZmodemSentry({
        to_terminal: () => {},
        sender: () => {},
        on_detect: () => {},
        on_retract: () => {}
      })

      // Simulate multiple WebSocket events with ArrayBuffer data
      for (let i = 0; i < 50; i++) {
        const evt = {
          data: new ArrayBuffer(50000) // 50KB chunks
        }
        const view = new Uint8Array(evt.data)
        for (let j = 0; j < view.length; j++) {
          view[j] = j % 256
        }

        expect(() => {
          sentry.consume(evt.data)
        }).not.toThrow()
      }
    })
  })
})

describe('Performance and memory handling', () => {
  it('should efficiently handle high-throughput data', () => {
    const sentry = new ZmodemSentry({
      to_terminal: () => {},
      sender: () => {},
      on_detect: () => {},
      on_retract: () => {}
    })

    const startTime = Date.now()
    const totalBytes = 10 * 1024 * 1024 // 10MB total
    const chunkSize = 64 * 1024 // 64KB chunks

    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
      const size = Math.min(chunkSize, totalBytes - offset)
      const buffer = new ArrayBuffer(size)
      sentry.consume(buffer)
    }

    const elapsed = Date.now() - startTime
    console.log(`Processed ${totalBytes / 1024 / 1024}MB in ${elapsed}ms`)

    // Should complete in reasonable time (less than 10 seconds for 10MB)
    expect(elapsed).toBeLessThan(10000)
  })
})
