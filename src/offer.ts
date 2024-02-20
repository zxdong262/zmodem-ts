import _Eventer from './eventer'
import { Opts, Obj } from './types'
import ZmodemError from './zerror'
import { transferOfferDecorator } from './transfer-offer-mixin'

const DEFAULT_RECEIVE_INPUT_MODE = 'spool_uint8array'

/**
 * A class to represent a receiver’s interaction with a single file
 * transfer offer within a batch. There is functionality here to
 * skip or accept offered files and either to spool the packet
 * payloads or to handle them yourself.
 */

class Offer extends transferOfferDecorator(_Eventer) {
  _zfile_opts: any
  _file_info: any
  _accept_func: Function
  _skip_func: Function
  _skipped: boolean = false
  _accepted: boolean = false
  _file_offset: number = 0
  _spool: any
  _input_handler_mode: string | Function = ''
  /**
   * Not called directly.
   */
  constructor (
    zfileOpts: Obj,
    fileInfo: Obj,
    acceptFunc: Function,
    skipFunc: Function
  ) {
    super()

    this._zfile_opts = zfileOpts
    this._file_info = fileInfo

    this._accept_func = acceptFunc
    this._skip_func = skipFunc

    this._Add_event('input')
    this._Add_event('complete')

    // Register this first so that application handlers receive
    // the updated offset.
    this.on('input', this._input_handler)
  }

  _verify_not_skipped (): void {
    if (this._skipped) {
      throw new ZmodemError('Already skipped!') // ??
    }
  }

  /**
   * Tell the sender that you don’t want the offered file.
   *
   * You can send this in lieu of `accept()` or after it, e.g.,
   * if you find that the transfer is taking too long. Note that,
   * if you `skip()` after you `accept()`, you’ll likely have to
   * wait for buffers to clear out.
   *
   */
  skip (...args: any[]): any {
    this._verify_not_skipped()
    this._skipped = true

    return this._skip_func.apply(this, args)
  }

  /**
   * Tell the sender to send the offered file.
   *
   * @param {Object} [opts] - Can be:
   * @param {string} [opts.oninput=spool_uint8array] - Can be:
   *
   * - `spool_uint8array`: Stores the ZMODEM
   *     packet payloads as Uint8Array instances.
   *     This makes for an easy transition to a Blob,
   *     which JavaScript can use to save the file to disk.
   *
   * - `spool_array`: Stores the ZMODEM packet payloads
   *     as Array instances. Each value is an octet value.
   *
   * - (function): A handler that receives each payload
   *     as it arrives. The Offer object does not store
   *     the payloads internally when thus configured.
   *
   * @return { Promise } Resolves when the file is fully received.
   *      If the Offer has been spooling
   *      the packet payloads, the promise resolves with an Array
   *      that contains those payloads.
   */
  async accept (opts: Opts = {}): Promise<any> {
    this._verify_not_skipped()

    if (this._accepted) {
      throw new ZmodemError('Already accepted!')
    }
    this._accepted = true

    this._file_offset = opts.offset ?? 0

    switch (opts.on_input) {
      case null:
      case undefined:
      case 'spool_array':
      case DEFAULT_RECEIVE_INPUT_MODE: // default
        this._spool = []
        break
      default:
        if (typeof opts.on_input !== 'function') {
          throw new Error('Invalid “on_input”: ' + opts.on_input)
        }
    }

    this._input_handler_mode = opts.on_input ?? DEFAULT_RECEIVE_INPUT_MODE

    return this._accept_func(this._file_offset).then(this._get_spool.bind(this))
  }

  _input_handler (payload: any): void {
    this._file_offset += payload.length as number

    if (typeof this._input_handler_mode === 'function') {
      this._input_handler_mode(payload)
    } else {
      if (this._input_handler_mode === DEFAULT_RECEIVE_INPUT_MODE) {
        payload = new Uint8Array(payload)
      } else if (this._input_handler_mode !== 'spool_array') {
        throw new ZmodemError(`WTF?? _input_handler_mode = ${this._input_handler_mode}`)
      }

      this._spool.push(payload)
    }
  }

  _get_spool (): any {
    return this._spool
  }
}

export default Offer
