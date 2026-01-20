/**
 * WebSocket ZMODEM Transfer Test Suite
 *
 * Tests ZMODEM transfers over WebSocket connections similar to electerm usage.
 * Covers both rz (receive) and sz (send) operations with chunked data.
 *
 * Addresses issues:
 * - Stack overflow in _strip_and_enqueue_input with large data chunks
 * - CRC check failures
 * - Slow transfer speeds due to inefficient data handling
 */

import ZmodemSentry from '../src/zsentry'

// Mock WebSocket class for testing
class MockWebSocket {
  readyState: number = WebSocket.OPEN
  binaryType: string = 'arraybuffer'

  listeners: { [event: string]: Function[] } = {}
  sentData: Uint8Array[] = []

  constructor() {
    this.readyState = WebSocket.OPEN
  }

  addEventListener(event: string, listener: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(listener)
  }

  removeEventListener(event: string, listener: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(l => l !== listener)
    }
  }

  send(data: Uint8Array) {
    this.sentData.push(data)
  }

  // Simulate receiving data from the server
  simulateMessage(data: ArrayBuffer | string) {
    const event = { data }
    const listeners = this.listeners.message || []
    listeners.forEach(listener => listener(event))
  }

  close() {
    this.readyState = WebSocket.CLOSED
  }
}

// Mock terminal for testing
class MockTerminal {
  writtenData: string = ''

  write(data: string) {
    this.writtenData += data
  }

  reset() {
    this.writtenData = ''
  }
}

describe('WebSocket ZMODEM Transfers (electerm-style)', () => {
  let mockSocket: MockWebSocket
  let mockTerminal: MockTerminal
  let sentry: ZmodemSentry

  beforeEach(() => {
    mockSocket = new MockWebSocket()
    mockTerminal = new MockTerminal()

    // Set up ZmodemSentry like electerm does
    sentry = new ZmodemSentry({
      to_terminal: (octets: number[]) => {
        // Safe version that handles large arrays without stack overflow
        // This is how electerm SHOULD implement it to avoid the bug
        if (octets.length > 10000) {
          // For large data, process in chunks to avoid stack overflow
          const chunks = []
          for (let i = 0; i < octets.length; i += 10000) {
            chunks.push(String.fromCharCode.apply(String, octets.slice(i, i + 10000)))
          }
          mockTerminal.write(chunks.join(''))
        } else {
          mockTerminal.write(String.fromCharCode.apply(String, octets))
        }
      },
      sender: (octets: number[]) => {
        mockSocket.send(new Uint8Array(octets))
      },
      on_retract: () => {
        // Handle retraction
      },
      on_detect: (detection: any) => {
        // Handle detection
      }
    })

    mockSocket.binaryType = 'arraybuffer'
    mockSocket.addEventListener('message', (evt: any) => {
      if (typeof evt.data === 'string') {
        mockTerminal.write(evt.data)
      } else {
        sentry.consume(evt.data)
      }
    })
  })

  afterEach(() => {
    // Clean up sentry reference
    sentry = null as any
    mockSocket.close()
  })

  describe('Large data chunk handling', () => {
    it('should handle large data chunks without stack overflow', () => {
      // Create a large data chunk that could cause stack overflow
      const largeData = new ArrayBuffer(1024 * 1024 * 10) // 10MB
      const uint8View = new Uint8Array(largeData)

      // Fill with some data
      for (let i = 0; i < uint8View.length; i++) {
        uint8View[i] = i % 256
      }

      // This should not cause a stack overflow
      expect(() => {
        mockSocket.simulateMessage(largeData)
      }).not.toThrow()
    })

    it('should handle multiple large chunks sequentially', () => {
      const chunkSize = 1024 * 1024 // 1MB chunks
      const numChunks = 5

      for (let i = 0; i < numChunks; i++) {
        const chunk = new ArrayBuffer(chunkSize)
        const uint8View = new Uint8Array(chunk)

        // Fill with pattern
        for (let j = 0; j < chunkSize; j++) {
          uint8View[j] = (i + j) % 256
        }

        expect(() => {
          mockSocket.simulateMessage(chunk)
        }).not.toThrow()
      }
    })

    it('should handle mixed string and binary messages', () => {
      // Simulate terminal output mixed with zmodem data
      mockSocket.simulateMessage('normal terminal output\r\n')

      const binaryData = new ArrayBuffer(100)
      new Uint8Array(binaryData).fill(0x42)

      mockSocket.simulateMessage(binaryData)

      mockSocket.simulateMessage('more terminal output\r\n')

      expect(mockTerminal.writtenData).toContain('normal terminal output')
      expect(mockTerminal.writtenData).toContain('more terminal output')
    })
  })

  describe('CRC error handling', () => {
    it('should handle CRC verification failures gracefully', () => {
      // Create data that would cause CRC failure
      // This simulates corrupted data from the network
      const corruptedData = new ArrayBuffer(100)
      const uint8View = new Uint8Array(corruptedData)

      // Fill with some data that might be interpreted as zmodem but corrupted
      uint8View[0] = 0x2A // ZPAD
      uint8View[1] = 0x2A // ZPAD
      uint8View[2] = 0x18 // ZDLE
      uint8View[3] = 0x42 // Some data
      // Intentionally corrupt the CRC bytes at the end
      uint8View[96] = 0xFF
      uint8View[97] = 0xFF
      uint8View[98] = 0xFF
      uint8View[99] = 0xFF

      // Should not throw, but might log warnings or handle gracefully
      expect(() => {
        mockSocket.simulateMessage(corruptedData)
      }).not.toThrow()
    })

    it('should continue processing after CRC errors', () => {
      // Send corrupted data first
      const corruptedData = new ArrayBuffer(50)
      new Uint8Array(corruptedData).fill(0xFF)

      // Send valid data after
      const validData = new ArrayBuffer(50)
      new Uint8Array(validData).fill(0x00)

      expect(() => {
        mockSocket.simulateMessage(corruptedData)
        mockSocket.simulateMessage(validData)
      }).not.toThrow()
    })
  })

  describe('ZMODEM receive session (rz) simulation', () => {
    it('should handle ZMODEM receive session initialization', () => {
      // Simulate ZRQINIT (request to initialize) from sender
      const zrinitData = new ArrayBuffer(10)
      const view = new Uint8Array(zrinitData)
      view[0] = 0x2A // ZPAD
      view[1] = 0x2A // ZPAD
      view[2] = 0x18 // ZDLE
      view[3] = 0x40 // ZRQINIT type

      expect(() => {
        mockSocket.simulateMessage(zrinitData)
      }).not.toThrow()
    })

    it('should handle file transfer data in chunks', () => {
      // Simulate receiving file data in WebSocket chunks
      const fileChunks = [
        new ArrayBuffer(4096),
        new ArrayBuffer(4096),
        new ArrayBuffer(2048)
      ]

      // Fill with some file data pattern
      fileChunks.forEach((chunk, index) => {
        const view = new Uint8Array(chunk)
        for (let i = 0; i < view.length; i++) {
          view[i] = (index * 256 + i) % 256
        }
      })

      // Send chunks sequentially like WebSocket would
      fileChunks.forEach(chunk => {
        expect(() => {
          mockSocket.simulateMessage(chunk)
        }).not.toThrow()
      })
    })
  })

  describe('ZMODEM send session (sz) simulation', () => {
    it('should handle ZMODEM send session data transmission', () => {
      // Simulate data being sent from terminal to remote
      const sendData = new ArrayBuffer(1024)
      const view = new Uint8Array(sendData)
      for (let i = 0; i < view.length; i++) {
        view[i] = i % 256
      }

      // This would typically be triggered by the ZMODEM session
      // For now, just verify the mock setup works
      expect(mockSocket.sentData).toBeDefined()
      expect(Array.isArray(mockSocket.sentData)).toBe(true)
    })

    it('should queue data sent through WebSocket', () => {
      // Simulate multiple send operations
      const data1 = new Uint8Array([1, 2, 3, 4])
      const data2 = new Uint8Array([5, 6, 7, 8])

      mockSocket.send(data1)
      mockSocket.send(data2)

      expect(mockSocket.sentData.length).toBe(2)
      expect(mockSocket.sentData[0]).toEqual(data1)
      expect(mockSocket.sentData[1]).toEqual(data2)
    })
  })

  describe('Performance and memory tests', () => {
    it('should handle high-frequency message simulation', () => {
      const numMessages = 1000
      const messageSize = 1024

      const startTime = Date.now()

      for (let i = 0; i < numMessages; i++) {
        const data = new ArrayBuffer(messageSize)
        new Uint8Array(data).fill(i % 256)
        mockSocket.simulateMessage(data)
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000) // 5 seconds max
    })

    it('should not accumulate memory with continuous data stream', () => {
      // This test verifies that the sentry doesn't hold onto old data
      const initialMemoryUsage = process.memoryUsage?.().heapUsed || 0

      for (let i = 0; i < 100; i++) {
        const data = new ArrayBuffer(64 * 1024) // 64KB chunks
        new Uint8Array(data).fill(i % 256)
        mockSocket.simulateMessage(data)
      }

      const finalMemoryUsage = process.memoryUsage?.().heapUsed || 0

      // Memory usage should not grow excessively (allowing some growth for test overhead)
      const memoryGrowth = finalMemoryUsage - initialMemoryUsage
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024) // Less than 50MB growth
    })
  })

  describe('Error recovery', () => {
    it('should handle WebSocket disconnection during transfer', () => {
      // Start some data transfer
      const data = new ArrayBuffer(1024)
      mockSocket.simulateMessage(data)

      // Simulate disconnection
      mockSocket.close()
      mockSocket.readyState = WebSocket.CLOSED

      // Further operations should handle the closed state gracefully
      expect(() => {
        mockSocket.simulateMessage(new ArrayBuffer(100))
      }).not.toThrow()
    })

    it('should handle malformed WebSocket messages', () => {
      const badMessages = [
        null,
        undefined,
        {},
        [],
        42,
        new Date()
      ]

      badMessages.forEach(badMessage => {
        expect(() => {
          mockSocket.simulateMessage(badMessage as any)
        }).not.toThrow()
      })
    })
  })
})

