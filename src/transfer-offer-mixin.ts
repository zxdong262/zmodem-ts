import { Obj } from './types'

export function transferOfferDecorator<T extends new (...args: any[]) => any> (target: T): T {
  return class extends target {
    get_details (): Obj {
      return Object.assign({}, this._file_info)
    }

    get_options (): Obj {
      return Object.assign({}, this._zfile_opts)
    }

    get_offset (): number {
      return this._file_offset
    }
  }
}
