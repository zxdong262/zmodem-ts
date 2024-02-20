import { ZmodemHeader } from './zheader'
import ZmodemSubpacket from './zsubpacket'
import { ZmodemEncodeLib } from './encode'
import ZmodemSessionBase from './zsess-base'
import Offer from './offer'

// We ourselves don't need ESCCTL, so we don't send it
// however, we always expect to receive it in ZRINIT.
// See _ensure_receiver_escapes_ctrl_chars() for more details.
const ZRINIT_FLAGS = [
  'CANFDX', // full duplex
  'CANOVIO', // overlap I/O

  // lsz has a buffer overflow bug that shows itself when:
  //
  //  - 16-bit CRC is used, and
  //  - lsz receives the abort sequence while sending a file
  //
  // To avoid this, we just tell lsz to use 32-bit CRC
  // even though there is otherwise no reason. This ensures that
  // unfixed lsz versions will avoid the buffer overflow.
  'CANFC32'
]

/** A class for ZMODEM receive sessions.
 *
 * @extends Session
 */
class ZmodemReceiveSession extends ZmodemSessionBase {
  _file_info: any = null
  _textdecoder: TextDecoder = new TextDecoder()
  _current_transfer: any = null
  _accepted_offer: boolean = false
  _offset_ok: boolean = false
  _file_offset: number = 0
  _attn: any
  _started: boolean = false
  type: string = 'receive'
  // We only get 1 file at a time, so on each consume() either
  // continue state for the current file or start a new one.

  /**
     * Not called directly.
     */
  constructor () {
    super()
    this._Add_event('offer')
    this._Add_event('data_in')
    this._Add_event('file_end')
  }

  /**
     * Consume input bytes from the sender.
     *
     * @private
     * @param {number[]} octets - The bytes to consume.
     */
  _before_consume (octets: number[]): void {
    if (this._bytes_after_OO != null) {
      throw new Error('PROTOCOL: Session is completed!')
    }

    // Put this here so that our logic later on has access to the
    // input string and can populate _bytes_after_OO when the
    // session ends.
    this._bytes_being_consumed = octets
  }

  /**
     * Return any bytes that have been `consume()`d but
     * came after the end of the ZMODEM session.
     *
     * @returns {number[]} The trailing bytes.
     */
  get_trailing_bytes (): number[] {
    if (this._aborted) return []

    if (this._bytes_after_OO == null) {
      throw new Error('PROTOCOL: Session is not completed!')
    }

    return this._bytes_after_OO.slice(0)
  }

  // Receiver always sends hex headers.
  // _get_header_formatter() { return 'to_hex' }

  _parse_and_consume_subpacket (): ZmodemSubpacket {
    let parseFunc
    if (this._last_header_crc === 16) {
      parseFunc = 'parse16'
    } else {
      parseFunc = 'parse32'
    }

    const subpacket = (ZmodemSubpacket as any)[parseFunc](this._input_buffer)
    if (subpacket !== undefined) {
      if (this.DEBUG) {
        console.debug(this.type, 'RECEIVED SUBPACKET', subpacket)
      }

      this._consume_data(subpacket)

      // What state are we in if the subpacket indicates frame end
      // but we haven’t gotten ZEOF yet? Can anything other than ZEOF
      // follow after a ZDATA?
      if (subpacket.frame_end() === true) {
        this._next_subpacket_handler = null
      }
    }

    return subpacket
  }

  _consume_data (subpacket: ZmodemSubpacket): void {
    this._on_receive(subpacket)

    if (this._next_subpacket_handler == null) {
      throw new Error('PROTOCOL: Received unexpected data packet after ' + this._last_header_name + ' header: ' + subpacket.getPayload().join())
    }

    this._next_subpacket_handler(subpacket)
  }

  _octets_to_string (octets: number[]): string {
    return this._textdecoder.decode(new Uint8Array(octets))
  }

  _consume_ZFILE_data (hdr: ZmodemHeader, subpacket: ZmodemSubpacket): void {
    if (this._file_info !== null) {
      throw new Error('PROTOCOL: second ZFILE data subpacket received')
    }

    const packetPayload = subpacket.getPayload()
    const nulAt = packetPayload.indexOf(0)

    //
    const fname = this._octets_to_string(packetPayload.slice(0, nulAt))
    const theRest = this._octets_to_string(packetPayload.slice(1 + nulAt)).split(' ')

    const mtime = theRest[1] !== undefined ? parseInt(theRest[1], 8) : undefined
    let date
    if (mtime !== undefined) {
      date = new Date(mtime * 1000)
    }

    this._file_info = {
      name: fname,
      size: theRest[0] !== undefined ? parseInt(theRest[0], 10) : null,
      mtime: date ?? mtime ?? 0,
      mode: theRest[2] !== undefined ? parseInt(theRest[2], 8) : null,
      serial: theRest[3] !== undefined ? parseInt(theRest[3], 10) : null,
      files_remaining: theRest[4] !== undefined ? parseInt(theRest[4], 10) : null,
      bytes_remaining: theRest[5] !== undefined ? parseInt(theRest[5], 10) : null
    }

    const xfer = new Offer(
      hdr.get_options(),
      this._file_info,
      this._accept.bind(this),
      this._skip.bind(this)
    )
    this._current_transfer = xfer

    // this._Happen('offer', xfer)
  }

  _consume_ZDATA_data (subpacket: ZmodemSubpacket): void {
    if (!this._accepted_offer) {
      throw new Error('PROTOCOL: Received data without accepting!')
    }

    // TODO: Probably should include some sort of preventive against
    // infinite loop here: if the peer hasn’t sent us what we want after,
    // say, 10 ZRPOS headers then we should send ZABORT and just end.
    if (!this._offset_ok) {
      console.warn('offset not ok!')
      this._send_ZRPOS()
      return
    }

    this._file_offset += subpacket.getPayload().length
    this._on_data_in(subpacket)

    /*
        console.warn('received error from data_in callback retrying', e)
        throw 'unimplemented'
        */

    if (subpacket.ackExpected() && !subpacket.frame_end()) {
      this._send_header('ZACK', ZmodemEncodeLib.pack_u32_le(this._file_offset))
    }
  }

  async _make_promise_for_between_files (): Promise<any> {
    return await new Promise((resolve, reject) => {
      const betweenFilesHandler = {
        ZFILE: (hdr: ZmodemHeader) => {
          this._next_subpacket_handler = (subpacket: ZmodemSubpacket) => {
            this._next_subpacket_handler = null
            this._consume_ZFILE_data(hdr, subpacket)
            this._Happen('offer', this._current_transfer)
            resolve(this._current_transfer)
          }
        },

        // We use this as a keep-alive. Maybe other
        // implementations do, too?
        ZSINIT: (hdr: ZmodemHeader) => {
          // The content of this header doesn’t affect us
          // since all it does is tell us details of how
          // the sender will ZDLE-encode binary data. Our
          // ZDLE parser doesn’t need to know in advance.

          this._next_subpacket_handler = function (spkt: ZmodemSubpacket) {
            this._next_subpacket_handler = null
            this._consume_ZSINIT_data(spkt)
            this._send_header('ZACK')
            this._next_header_handler = betweenFilesHandler
          }
        },

        ZFIN: () => {
          this._consume_ZFIN()
          resolve('ok')
        }
      }

      this._next_header_handler = betweenFilesHandler
    })
  }

  _consume_ZSINIT_data (spkt: ZmodemSubpacket): void {
    // TODO: Should this be used when we signal a cancellation?
    this._attn = spkt.getPayload()
  }

  /**
     * Start the ZMODEM session by signaling to the sender that
     * we are ready for the first file offer.
     *
     * @returns {Promise} A promise that resolves with an Offer object
     * or, if the sender closes the session immediately without offering
     * anything, nothing.
     */
  async start (): Promise<any> {
    if (this._started) throw new Error('Already started!')
    this._started = true

    const ret = this._make_promise_for_between_files()

    this._send_ZRINIT()

    return await ret
  }

  // Returns a promise that’s fulfilled when the file
  // transfer is done.
  //
  //  That ZEOF promise return is another promise that’s
  //  fulfilled when we get either ZFIN or another ZFILE.
  async _accept (offset: number = 0): Promise<any> {
    this._accepted_offer = true
    this._file_offset = offset

    const ret = new Promise((resolve) => {
      this._next_header_handler = {
        ZDATA: (hdr: ZmodemHeader) => {
          this._consume_ZDATA(hdr)

          this._next_subpacket_handler = this._consume_ZDATA_data

          this._next_header_handler = {
            ZEOF: (hdr: ZmodemHeader) => {
              // Do this first to verify the ZEOF.
              // This also fires the “file_end” event.
              this._consume_ZEOF(hdr)

              this._next_subpacket_handler = null

              // We don’t care about this promise.
              // Prior to v0.1.8 we did because we called
              // resolve_accept() at the resolution of this
              // promise, but that was a bad idea and was
              // never documented, so 0.1.8 changed it.
              // eslint-disable-next-line
              this._make_promise_for_between_files()

              resolve('ok')

              this._send_ZRINIT()
            }
          }
        }
      }
    })

    this._send_ZRPOS()

    return await ret
  }

  bound_make_promise_for_between_files = (): void => {
    this._accepted_offer = false
    this._next_subpacket_handler = null
    // eslint-disable-next-line
    this._make_promise_for_between_files()
  }

  async _skip (): Promise<any> {
    const ret = this._make_promise_for_between_files()
    if (this._accepted_offer) {
      if (this._current_transfer === null) return
      Object.assign(
        this._next_header_handler,
        {
          ZEOF: this.bound_make_promise_for_between_files,
          ZDATA: () => {
            this.bound_make_promise_for_between_files()
            this._next_header_handler.ZEOF = this.bound_make_promise_for_between_files
          }
        }
      )
    }

    // this._accepted_offer = false

    this._file_info = null

    this._send_header('ZSKIP')

    return await ret
  }

  _send_ZRINIT (): void {
    this._send_header('ZRINIT', ZRINIT_FLAGS)
  }

  _consume_ZFIN (): void {
    this._got_ZFIN = true
    this._send_header('ZFIN')
  }

  _consume_ZEOF (header: ZmodemHeader): void {
    if (this._file_offset !== header.get_offset()) {
      throw new Error(`ZEOF offset mismatch unimplemented (local: ${this._file_offset} ZEOF: ${header.get_offset()} )`)
    }

    this._on_file_end()

    // Preserve these two so that file_end callbacks
    // will have the right information.
    this._file_info = null
    this._current_transfer = null
  }

  _consume_ZDATA (header: ZmodemHeader): void {
    if (this._file_offset === header.get_offset()) {
      this._offset_ok = true
    } else {
      throw new Error('Error correction is unimplemented.')
    }
  }

  _send_ZRPOS (): void {
    this._send_header('ZRPOS', this._file_offset)
  }

  // ----------------------------------------------------------------------
  // events

  _on_file_end (): void {
    this._Happen('file_end')

    if (this._current_transfer !== null) {
      this._current_transfer._Happen('complete')
      this._current_transfer = null
    }
  }

  _on_data_in (subpacket: ZmodemSubpacket): void {
    this._Happen('data_in', subpacket)

    if (this._current_transfer !== null) {
      this._current_transfer._Happen('input', subpacket.getPayload())
    }
  }
}

export default ZmodemReceiveSession
