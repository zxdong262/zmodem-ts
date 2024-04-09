import _Eventer from './eventer'
import ZMLIB from './zmlib'
import { ZmodemHeader } from './zheader'
import { Obj } from './types'
import ZmodemError from './zerror'
import ZmodemZDLE from './zdle'
import ZmodemSubpacket from './zsubpacket'
import { AnyClass } from './zheader-functions2'

const BS = 0x8
const OVER_AND_OUT = [79, 79]
const ABORT_SEQUENCE = ZMLIB.ABORT_SEQUENCE

function trimOO (array: number[]): number[] {
  if (ZMLIB.findSubarray(array, OVER_AND_OUT) === 0) {
    array.splice(0, OVER_AND_OUT.length)
  } else if (array[0] === OVER_AND_OUT[OVER_AND_OUT.length - 1]) {
    array.splice(0, 1)
  }
  return array
}

class ZmodemSessionBase extends _Eventer {
  _zencoder: ZmodemZDLE = new ZmodemZDLE()
  _last_sent_header: any = null
  _next_header_handler: any = null
  _last_header_crc: number = 0
  _last_header_name: string = ''
  _next_subpacket_handler: Function | null = null
  _bytes_after_OO: number[] | null = null
  _bytes_being_consumed: number[] = []
  _got_ZFIN: boolean = false
  DEBUG: boolean = false
  type: string = ''
  _aborted: boolean = false
  _config: Obj = {}
  _input_buffer: number[] = []
  _sender?: Function

  constructor () {
    super()
    this._config = {}
    this._input_buffer = []
    this._Add_event('receive')
    this._Add_event('garbage')
    this._Add_event('session_end')
  }

  get_trailing_bytes (): any {}
  async send_offer (opts: any): Promise<any> {
    return await Promise.resolve()
  }

  set_sender (senderFunc: Function): this {
    this._sender = senderFunc
    return this
  }

  /**
   * Whether the current Session has ended.
   *
   * @returns The ended state.
   */
  has_ended (): boolean {
    return this._has_ended() // ?? this._has_ended()
  }

  _has_ended (): boolean { return this.aborted() || !(this._bytes_after_OO == null) }

  /**
   * Consumes an array of octets as ZMODEM session input.
   *
   * @param octets - The input octets.
   */
  consume = (octets: number[]): void => {
    this._before_consume(octets)
    if (this._aborted) throw new ZmodemError('already_aborted')
    if (octets.length === 0) return
    this._strip_and_enqueue_input(octets)
    if (this._check_for_abort_sequence() !== true) {
      this._consume_first()
    }
  }

  _consume_first = (): void => {
    if (this._got_ZFIN) {
      if (this._input_buffer.length < 2) {
        return
      }
      // if it’s OO, then set this._bytes_after_OO
      if (ZMLIB.findSubarray(this._input_buffer, OVER_AND_OUT) === 0) {
        // This doubles as an indication that the session has ended.
        // We need to set this right away so that handlers like
        // "session_end" will have access to it.
        this._bytes_after_OO = trimOO(this._bytes_being_consumed.slice(0))
        this._on_session_end()
        return
      } else {
        console.error('PROTOCOL: Only thing after ZFIN should be “OO” (79,79), not: ' + this._input_buffer.join())
        return
      }
    }

    let parsed
    do {
      if (this._next_subpacket_handler != null) {
        parsed = this._parse_and_consume_subpacket()
      } else {
        parsed = this._parse_and_consume_header()
      }
    } while ((parsed != null) && (this._input_buffer.length > 0))
  }

  /**
   * Whether the current Session has been `abort()`ed.
   *
   * @returns The aborted state.
   */
  aborted (): boolean {
    return !!this._aborted
  }

  _parse_and_consume_subpacket (): any { }

  /**
   * Returns the Session object’s role.
   *
   * @returns One of:
   * - `receive`
   * - `send`
   */
  get_role (): string {
    return this.type
  }

  _trim_leading_garbage_until_header (): void {
    const garbage = ZmodemHeader.trimLeadingGarbage(this._input_buffer)
    if (garbage !== undefined && garbage.length > 0) {
      if (this._Happen('garbage', garbage) === 0) {
        console.debug(
          'Garbage: ',
          String.fromCharCode(...garbage),
          garbage
        )
      }
    }
  }

  _parse_and_consume_header = (): AnyClass | undefined => {
    this._trim_leading_garbage_until_header()
    const newHeaderAndCrc = ZmodemHeader.parse(this._input_buffer)
    if (newHeaderAndCrc === undefined) return
    const hdr = newHeaderAndCrc[0] as any
    if (this.DEBUG) {
      this._log_header('RECEIVED HEADER', hdr)
    }
    this._consume_header(hdr)
    this._last_header_name = hdr.NAME
    this._last_header_crc = newHeaderAndCrc[1]
    return hdr
  }

  _log_header = (label: string, header: ZmodemHeader): void => {
    console.debug(this.type, label, header.NAME, header._bytes4.join())
  }

  _consume_header (newHeader: ZmodemHeader): any {
    this._on_receive(newHeader)
    const handler = this._next_header_handler !== null
      ? this._next_header_handler[newHeader.NAME]
      : undefined
    if (handler === undefined) {
      console.error('Unhandled header!', newHeader, this._next_header_handler)
      throw new ZmodemError('Unhandled header: ' + newHeader.NAME)
    }
    this._next_header_handler = null
    handler.call(this, newHeader)
  }

  _check_for_abort_sequence (): boolean | undefined {
    const abortAt = ZMLIB.findSubarray(this._input_buffer, ABORT_SEQUENCE)
    if (abortAt !== -1) {
      // TODO: expose this to caller
      this._input_buffer.splice(0, abortAt + ABORT_SEQUENCE.length)
      this._aborted = true
      // TODO compare response here to lrzsz.
      this._on_session_end()
      throw new ZmodemError('peer_aborted')
    }
    return false
  }

  _send_header (name: string, ...args: any[]): void {
    if (this._sender === undefined) {
      throw new Error('Need sender!')
    }
    const bytesHdr = this._create_header_bytes(name, ...args)
    if (this.DEBUG) {
      this._log_header('SENDING HEADER', bytesHdr[1])
    }
    this._sender(bytesHdr[0])
    this._last_sent_header = bytesHdr[1]
  }

  _create_header_bytes (name: string, ...args: any[]): any {
    const hdr = ZmodemHeader.build(name, ...args) as any
    const formatter: string = this._get_header_formatter(name)
    return [(hdr[formatter] as Function)(this._zencoder), hdr]
  }

  _get_header_formatter (name: string): string { return 'to_hex' }

  _strip_and_enqueue_input (input: number[]): void {
    ZMLIB.stripIgnoredBytes(input)
    this._input_buffer.push.apply(this._input_buffer, input)
  }

  abort (): void {
    if (this._sender !== undefined) {
      this._sender(ABORT_SEQUENCE.concat([BS, BS, BS, BS, BS]))
    }
    this._aborted = true
    this._sender = function () {
      throw new ZmodemError('already_aborted')
    }
    this._on_session_end()
  }

  _on_session_end (): void {
    this._Happen('session_end')
  }

  _on_receive (hdrOrPkt: ZmodemHeader | ZmodemSubpacket): void {
    this._Happen('receive', hdrOrPkt)
  }

  _before_consume (arr: number[]): void { }
}

export default ZmodemSessionBase
