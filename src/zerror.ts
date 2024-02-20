function crcMessage (got: number[], expected: number[]): string {
  return (
    'CRC check failed! (got: ' +
    got.join() +
    '; expected: ' +
    expected.join() +
    ')'
  )
}

function pass<T> (value: T): T {
  return value
}

const typeMessage: Record<string, unknown> = {
  aborted: 'Session aborted',
  peerAborted: 'Peer aborted session',
  alreadyAborted: 'Session already aborted',
  crc: crcMessage,
  validation: pass
}

function generateMessage (type: string, ...args: any[]): any {
  const message = typeMessage[type]
  switch (typeof message) {
    case 'string':
      return message
    case 'function':
      return message(...args)
  }

  return null
}

class ZmodemError extends Error {
  type?: string
  constructor (messageOrType: string, ...args: any[]) {
    super()

    const generated = generateMessage(messageOrType, ...args)
    if (generated !== null) {
      this.type = messageOrType
      this.message = generated
    } else {
      this.message = messageOrType
    }
  }
}

export default ZmodemError
