
import { Obj } from './types'
import { transferOfferDecorator } from './transfer-offer-mixin'

/**
 * A class to represent a receiver’s interaction with a single file
 * transfer offer within a batch. There is functionality here to
 * skip or accept offered files and either to spool the packet
 * payloads or to handle them yourself.
 */

class Transfer extends transferOfferDecorator(Object) {
  _file_info: Obj
  _file_offset: number
  _send: Function
  _end: Function
  /**
     * Not called directly.
     */
  constructor (
    fileInfo: Obj,
    offset: number,
    sendFunc: Function,
    endFunc: Function
  ) {
    super()
    this._file_info = fileInfo
    this._file_offset = offset ?? 0
    this._send = sendFunc
    this._end = endFunc
  }

  /**
   * Send a (non-terminal) piece of the file.
   *
   * @param { number[] | Uint8Array } arrayLike - The bytes to send.
   */
  send (arrayLike: number[] | Uint8Array): void {
    this._send(arrayLike)
    this._file_offset += arrayLike.length
  }

  /**
   * Complete the file transfer.
   *
   * @param { number[] | Uint8Array } [arrayLike] - The last bytes to send.
   *
   * @return { Promise } Resolves when the receiver has indicated
   *      acceptance of the end of the file transfer.
   */
  async end (arrayLike: number[] | Uint8Array | undefined): Promise<any> {
    const ret = this._end(arrayLike ?? [])
    if (arrayLike !== undefined) {
      this._file_offset += arrayLike.length
    }
    return ret
  }
}

export default Transfer
