import ZmodemError from './zerror'
import { ValidateParams } from './types'

// eslint-disable-next-line
const LOOKS_LIKE_ZMODEM_HEADER = /\*\x18[AC]|\*\*\x18B/

function validateNumber (key: string, value: number): void {
  if (value < 0) {
    throw new ZmodemError(
      'validation',
      `“${key}” (${value}) must be nonnegative.`
    )
  }

  if (value !== Math.floor(value)) {
    throw new ZmodemError(
      'validation',
      `“${key}” (${value}) must be an integer.`
    )
  }
}

/**
 * Validation logic for zmodem.js
 * params : {
    name?: string
    serial?: any
    size?: number
    mode?: number
    files_remaining?: number
    bytes_remaining?: number
    mtime?: number | Date | null
  }
 *
 * @exports Validation
 */
const ZmodemValidation = {
  offerParameters (params: ValidateParams): ValidateParams {
    // So that we can override values as is useful
    // without affecting the passed-in object.
    params = Object.assign({}, params)

    if (LOOKS_LIKE_ZMODEM_HEADER.test(params.name ?? '')) {
      console.warn(
        `The filename ${JSON.stringify(params.name)} contains characters that look like a ZMODEM header. This could corrupt the ZMODEM session; consider renaming it so that the filename doesn’t contain control characters.`
      )
    }

    if (params.serial !== null && params.serial !== undefined) {
      throw new ZmodemError('validation', '“serial” is meaningless.')
    }

    params.serial = null

    if (typeof params.mode === 'number') {
      params.mode |= 0x8000
    }

    if (params.files_remaining === 0) {
      throw new ZmodemError(
        'validation',
        '“files_remaining”, if given, must be positive.'
      )
    }

    let mtimeOk
    const mt = params.mtime ?? 0
    switch (typeof mt) {
      case 'object':
        mtimeOk = true

        if (mt instanceof Date) {
          params.mtime = Math.floor(mt.getTime() / 1000)
        } else if (params.mtime !== null) {
          mtimeOk = false
        }

        break

      case 'undefined':
        params.mtime = 0
        mtimeOk = true
        break
      case 'number':
        validateNumber('mtime', mt)
        mtimeOk = true
        break
    }

    if (!mtimeOk) {
      throw new ZmodemError(
        'validation',
        `“mtime” (${mt.toString()}) must be null, undefined, a Date, or a number.`
      )
    }

    return params
  }
}

export default ZmodemValidation
