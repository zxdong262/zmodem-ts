import { ZmodemHeader } from './zheader'
import { ValidateParams, Obj } from './types'
import ZmodemValidation from './zvalidation'
import ZmodemZDLE from './zdle'
import ZmodemSubpacket from './zsubpacket'
import ZmodemSessionBase from './zsess-base'
import Transfer from './transfer'

const
  // pertinent to this module
  KEEPALIVE_INTERVAL = 5000

// We do this because some WebSocket shell servers
// (e.g., xterm.js's demo server) enable the IEXTEN termios flag,
// which bars 0x0f and 0x16 from reaching the shell process,
// which results in transmission errors.
const FORCE_ESCAPE_CTRL_CHARS = true

// pertinent to ZMODEM
const MAX_CHUNK_LENGTH = 8192 // 1 KiB officially, but lrzsz allows 8192
const OVER_AND_OUT = [79, 79]

// Curious that ZSINIT isn’t here … but, lsz sends it as hex.
const SENDER_BINARY_HEADER: Obj = {
  ZFILE: true,
  ZDATA: true
}

/** A class for ZMODEM receive sessions.
 *
 * @extends Session
 */
class ZmodemSendSession extends ZmodemSessionBase {
  _subpacket_encode_func: any
  _start_keepalive_on_set_sender: boolean
  _keepalive_promise: any = null
  _keepalive_timeout: any
  _got_ZSINIT_ZACK: boolean = false
  _textencoder: TextEncoder = new TextEncoder()
  _sent_OO: any
  _sending_file: boolean = false
  // _offset_ok: boolean = false
  _file_offset: number = 0
  _last_ZRINIT?: ZmodemHeader
  _sent_ZDATA: boolean = false
  type: string = 'send'
  _sender: Function = () => null
  // We only get 1 file at a time, so on each consume() either
  // continue state for the current file or start a new one.

  /**
   * Not called directly.
   */
  constructor (zrinitHdr?: ZmodemHeader) {
    super()

    if (zrinitHdr === undefined) {
      throw new Error('Need first header!')
    } else if (zrinitHdr.NAME !== 'ZRINIT') {
      throw new Error('First header should be ZRINIT, not ' + zrinitHdr.NAME)
    }

    this._last_header_name = 'ZRINIT'

    // We don’t need to send crc32. Even if the other side can grok it,
    // there’s no point to sending it since, for now, we assume we’re
    // on a reliable connection, e.g., TCP. Ideally we’d just forgo
    // CRC checks completely, but ZMODEM doesn’t allow that.
    //
    // If we *were* to start using crc32, we’d update this every time
    // we send a header.
    this._subpacket_encode_func = 'encode16'

    this._zencoder = new ZmodemZDLE()

    this._consume_ZRINIT(zrinitHdr)

    this._file_offset = 0

    this._start_keepalive_on_set_sender = true

    // lrzsz will send ZRINIT until it gets an offer. (keep-alive?)
    // It sends 4 additional ones after the initial ZRINIT and, if
    // no response is received, starts sending “C” (0x43, 67) as if to
    // try to downgrade to XMODEM or YMODEM.
    // let sess = this
    // this._prepare_to_receive_ZRINIT( function keep_alive() {
    //    sess._prepare_to_receive_ZRINIT(keep_alive)
    // } )

    // queue up the ZSINIT flag to send -- but seems useless??

    /*
    Object.assign(
        this._on_evt,
        {
            file_received: [],
        },
    }
    */
  }

  /**
   * Sets the sender function. The first time this is called,
   * it will also initiate a keepalive using ZSINIT until the
   * first file is sent.
   *
   * @param {Function} func - The function to call.
   *  It will receive an Array with the relevant octets.
   *
   * @return {Session} The session object (for chaining).
   */
  set_sender = (func: Function): this => {
    super.set_sender(func)

    if (this._start_keepalive_on_set_sender) {
      this._start_keepalive_on_set_sender = false
      this._start_keepalive()
    }

    return this
  }

  // 7.3.3 .. The sender also uses hex headers when they are
  // not followed by binary data subpackets.
  //
  // FG: … or when the header is ZSINIT? That’s what lrzsz does, anyway.
  // Then it sends a single NUL byte as the payload to an end_ack subpacket.
  _get_header_formatter (name: string): string {
    return SENDER_BINARY_HEADER[name] === true ? 'to_binary16' : 'to_hex'
  }

  // In order to keep lrzsz from timing out, we send ZSINIT every 5 seconds.
  // Maybe make this configurable?
  _start_keepalive = (): void => {
    // if (this._keepalive_promise) throw 'Keep-alive already started!'
    if (this._keepalive_promise === null) {
      this._keepalive_promise = new Promise((resolve) => {
        this._keepalive_timeout = setTimeout(resolve, KEEPALIVE_INTERVAL)
      }).then(() => {
        this._next_header_handler = {
          ZACK: () => {
            // We’re going to need to ensure that the
            // receiver is ready for all control characters
            // to be escaped. If we’ve already sent a ZSINIT
            // and gotten a response, then we know that that
            // work is already done later on when we actually
            // send an offer.
            this._got_ZSINIT_ZACK = true
          }
        }
        this._send_ZSINIT()

        this._keepalive_promise = null
        this._start_keepalive()
      })
    }
  }

  _stop_keepalive (): void {
    if (this._keepalive_promise !== null) {
      clearTimeout(this._keepalive_timeout)
      this._keepalive_promise = null
    }
  }

  _send_ZSINIT (): void {
    // See note at _ensure_receiver_escapes_ctrl_chars()
    // for why we have to pass ESCCTL.
    const zsinitFlags: any[] = []
    if (this._zencoder.escapes_ctrl_chars()) {
      zsinitFlags.push('ESCCTL' as never)
    }
    this._send_header_and_data(
      ['ZSINIT', zsinitFlags],
      [0],
      'end_ack'
    )
  }

  _consume_ZRINIT (hdr: ZmodemHeader): void {
    this._last_ZRINIT = hdr
    const size = hdr.get_buffer_size() as string
    if (size !== undefined) {
      throw new Error(`Buffer size ( ${size} ) is unsupported!`)
    }

    if (!hdr.can_full_duplex()) {
      throw new Error('Half-duplex I/O is unsupported!')
    }

    if (!hdr.can_overlap_io()) {
      throw new Error('Non-overlap I/O is unsupported!')
    }

    if (hdr.escape_8th_bit()) {
      throw new Error('8-bit escaping is unsupported!')
    }

    if (FORCE_ESCAPE_CTRL_CHARS) {
      this._zencoder.set_escape_ctrl_chars(true)
      if (!hdr.escape_ctrl_chars()) {
        console.debug('Peer didn’t request escape of all control characters. Will send ZSINIT to force recognition of escaped control characters.')
      }
    } else {
      this._zencoder.set_escape_ctrl_chars(hdr.escape_ctrl_chars())
    }
  }

  // https://stackoverflow.com/questions/23155939/missing-0xf-and-0x16-when-binary-data-through-virtual-serial-port-pair-created-b
  // ^^ Because of that, we always escape control characters.
  // The alternative would be that lrz would never receive those
  // two bytes from zmodem.js.
  _ensure_receiver_escapes_ctrl_chars = async (): Promise<any> => {
    let promise

    const needsZSINIT = this._last_ZRINIT !== undefined &&
      !this._last_ZRINIT.escape_ctrl_chars() &&
      !this._got_ZSINIT_ZACK
    if (needsZSINIT) {
      promise = new Promise((resolve) => {
        this._next_header_handler = {
          ZACK: (hdr: ZmodemHeader) => {
            resolve('')
          }
        }
        this._send_ZSINIT()
      })
    } else {
      promise = Promise.resolve()
    }

    return await promise
  }

  _convert_params_to_offer_payload_array = (_params: ValidateParams): number[] => {
    const params = ZmodemValidation.offerParameters(_params)
    let subpacketPayload = params.name + '\x00'
    const subpacketSpacePieces = [
      (params.size ?? 0).toString(10),
      params.mtime !== undefined ? params.mtime.toString(8) : '0',
      params.mode !== undefined ? (0x8000 | params.mode).toString(8) : '0',
      '0' // serial
    ]

    if (params.files_remaining !== undefined) {
      subpacketSpacePieces.push(params.files_remaining as never)
      if (params.bytes_remaining !== undefined) {
        subpacketSpacePieces.push(params.bytes_remaining as never)
      }
    }

    subpacketPayload += subpacketSpacePieces.join(' ')
    return this._string_to_octets(subpacketPayload)
  }

  /**
   * Send an offer to the receiver.
   *
   * @param {FileDetails} params - All about the file you want to transfer.
   *
   * @returns {Promise} If the receiver accepts the offer, then the
   * resolution is a Transfer object otherwise the resolution is
   * undefined.
   */
  send_offer = async (params: ValidateParams): Promise<any> => {
    if (this.DEBUG) {
      console.debug('SENDING OFFER', params)
    }
    if (this._sending_file) throw new Error('Already sending file!')
    const payloadArray = this._convert_params_to_offer_payload_array(params)
    this._stop_keepalive()
    const zrposHandlerSetterFunc = (): void => {
      this._next_header_handler = {
        // The receiver may send ZRPOS in at least two cases:
        //
        // 1) A malformed subpacket arrived, so we need to
        // “rewind” a bit and continue from the receiver’s
        // last-successful location in the file.
        //
        // 2) The receiver hasn’t gotten any data for a bit,
        // so it sends ZRPOS as a “ping”.
        //
        // Case #1 shouldn’t happen since zmodem.js requires a
        // reliable transport. Case #2, though, can happen due
        // to either normal network congestion or errors in
        // implementation. In either case, there’s nothing for
        // us to do but to ignore the ZRPOS, with an optional
        // warning.
        //
        ZRPOS: (hdr: ZmodemHeader) => {
          zrposHandlerSetterFunc()
        }
      }
    }
    const doerFunc = async (): Promise<any> => {
      // return Promise object that is fulfilled when the ZRPOS or ZSKIP arrives.
      // The promise value is the byte offset, or undefined for ZSKIP.
      // If ZRPOS arrives, then send ZDATA(0) and set this._sending_file.
      const handlerSetterPromise = new Promise((resolve) => {
        this._next_header_handler = {
          ZSKIP: () => {
            this._start_keepalive()
            resolve('')
          },
          ZRPOS: (hdr: ZmodemHeader) => {
            this._sending_file = true
            zrposHandlerSetterFunc()
            resolve(
              new Transfer(
                params,
                hdr.get_offset(),
                this._send_interim_file_piece.bind(this),
                this._end_file.bind(this)
              )
            )
          }
        }
      })
      this._send_header_and_data(['ZFILE'], payloadArray, 'end_ack')
      this._sent_ZDATA = false
      return await handlerSetterPromise
    }

    if (FORCE_ESCAPE_CTRL_CHARS) {
      return await this._ensure_receiver_escapes_ctrl_chars().then(doerFunc)
    }
    return await doerFunc()
  }

  _send_header_and_data = (hdrNameAndArgs: any[], dataArr: any[], frameEnd: string): void => {
    const [name, ...args] = hdrNameAndArgs
    const bytesHdr = this._create_header_bytes(name, ...args)
    const dataBytes = this._build_subpacket_bytes(dataArr, frameEnd)
    bytesHdr[0].push.apply(bytesHdr[0], dataBytes)
    if (this.DEBUG) {
      this._log_header('SENDING HEADER', bytesHdr[1])
      console.debug(this.type, '-- HEADER PAYLOAD:', frameEnd, dataBytes.length)
    }
    this._sender(bytesHdr[0])
    this._last_sent_header = bytesHdr[1]
  }

  _build_subpacket_bytes = (bytesArr: number[], frameEnd: string): any => {
    const subpacket = ZmodemSubpacket.build(bytesArr, frameEnd)
    return (subpacket as any)[this._subpacket_encode_func](this._zencoder)
  }

  _build_and_send_subpacket = (bytesArr: number[], frameEnd: string): void => {
    this._sender(this._build_subpacket_bytes(bytesArr, frameEnd))
  }

  _string_to_octets = (str: string): number[] => {
    const uint8arr = this._textencoder.encode(str)
    return Array.prototype.slice.call(uint8arr)
  }

  /*
  Potential future support for responding to ZRPOS:
  send_file_offset(offset) {
  }
  */

  /*
      Sending logic works thus:
          - ASSUME the receiver can overlap I/O (CANOVIO)
              (so fail if !CANFDX || !CANOVIO)
          - Sender opens the firehose … all ZCRCG (!end/!ack)
              until the end, when we send a ZCRCE (end/!ack)
              NB: try 8k/32k/64k chunk sizes? Looks like there’s
              no need to change the packet otherwise.
  */
  // TODO: Put this on a Transfer object similar to what Receive uses?
  _send_interim_file_piece = async (bytesObj: number[]): Promise<any> => {
    // We don’t ask the receiver to confirm because there’s no need.
    this._send_file_part(bytesObj, 'no_end_no_ack')

    // This pattern will allow
    // error-correction without buffering the entire stream in JS.
    // For now the promise is always resolved, but in the future we
    // can make it only resolve once we’ve gotten acknowledgement.
    return await Promise.resolve()
  }

  _ensure_we_are_sending = (): void => {
    if (!this._sending_file) throw new Error('Not sending a file currently!')
  }

  // This resolves once we receive ZEOF.
  _end_file = async (bytesObj: number[]): Promise<any> => {
    this._ensure_we_are_sending()
    // Is the frame-end-ness of this last packet redundant
    // with the ZEOF packet?? - No. It signals the receiver that
    // the next thing to expect is a header, not a packet.
    // no-ack, following lrzsz’s example
    this._send_file_part(bytesObj, 'end_no_ack')
    // Register this before we send ZEOF in case of local round-trip.
    // (Basically just for synchronous testing, but.)
    const ret = new Promise((resolve) => {
      this._sending_file = false
      this._prepare_to_receive_ZRINIT(resolve)
    })
    this._send_header('ZEOF', this._file_offset)
    this._file_offset = 0
    return await ret
  }

  // Called at the beginning of our session
  // and also when we’re done sending a file.
  _prepare_to_receive_ZRINIT = (afterConsume: Function): void => {
    this._next_header_handler = {
      ZRINIT: (hdr: ZmodemHeader) => {
        this._consume_ZRINIT(hdr)
        afterConsume()
      }
    }
  }

  /**
   * Signal to the receiver that the ZMODEM session is wrapping up.
   *
   * @returns {Promise} Resolves when the receiver has responded to
   * our signal that the session is over.
   */
  close = async (): Promise<any> => {
    let okToClose = (this._last_header_name === 'ZRINIT')
    if (!okToClose) {
      okToClose = (this._last_header_name === 'ZSKIP')
    }
    if (!okToClose) {
      okToClose = (this._last_sent_header.name === 'ZSINIT') && (this._last_header_name === 'ZACK')
    }
    if (!okToClose) {
      throw new Error('Can’t close last received header was “' + this._last_header_name + '”')
    }
    const ret = new Promise((resolve) => {
      this._next_header_handler = {
        ZFIN: () => {
          this._sender(OVER_AND_OUT)
          this._sent_OO = true
          this._on_session_end()
          resolve('')
        }
      }
    })
    this._send_header('ZFIN')
    return await ret
  }

  _has_ended = (): boolean => {
    return this.aborted() || this._sent_OO
  }

  _send_file_part = (bytesObj: number[], finalPacketend: string): void => {
    if (!this._sent_ZDATA) {
      this._send_header('ZDATA', this._file_offset)
      this._sent_ZDATA = true
    }

    let objOffset = 0

    const bytesCount = bytesObj.length

    // We have to go through at least once in event of an
    // empty buffer, e.g., an empty end_file.
    while (true) {
      const chunkSize = Math.min(objOffset + MAX_CHUNK_LENGTH, bytesCount) - objOffset

      const atEnd = (chunkSize + objOffset) >= bytesCount

      let chunk = bytesObj.slice(objOffset, objOffset + chunkSize)
      if (!(chunk instanceof Array)) {
        chunk = Array.prototype.slice.call(chunk)
      }

      this._build_and_send_subpacket(
        chunk,
        atEnd ? finalPacketend : 'no_end_no_ack'
      )

      this._file_offset += chunkSize
      objOffset += chunkSize

      if (objOffset >= bytesCount) break
    }
  }

  _consume_first = (): void => {
    if (this._parse_and_consume_header() == null) {
      // When the ZMODEM receive program starts, it immediately sends
      // a ZRINIT header to initiate ZMODEM file transfers, or a
      // ZCHALLENGE header to verify the sending program. The receive
      // program resends its header at response time (default 10 second)
      // intervals for a suitable period of time (40 seconds total)
      // before falling back to YMODEM protocol.
      if (this._input_buffer.join() === '67') {
        throw new Error('Receiver has fallen back to YMODEM.')
      }
    }
  }

  _on_session_end = (): void => {
    this._stop_keepalive()
    super._on_session_end()
  }
}

export default ZmodemSendSession
