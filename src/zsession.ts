import ZmodemSessionBase from './zsess-base'
import { ZmodemHeader } from './zheader'
import ZmodemReceiveSession from './zsess-receive'
import ZmodemSendSession from './zsess-sender'

class ZmodemSession extends ZmodemSessionBase {
  static parse (octets: number[]): ZmodemReceiveSession | ZmodemSendSession | undefined {
    // Will need to trap errors.
    let hdr: any
    try {
      hdr = ZmodemHeader.parse_hex(octets)
    } catch (e) { // Don’t report since we aren’t in session
      // debug
      console.warn('No hex header: ', e)
      return
    }
    switch (hdr.NAME) {
      case 'ZRQINIT':
        // throw if ZCOMMAND
        return new ZmodemReceiveSession()
      case 'ZRINIT':
        return new ZmodemSendSession(hdr)
    }

    // console.warn('Invalid first Zmodem header', hdr)
  }
}

export default ZmodemSession
