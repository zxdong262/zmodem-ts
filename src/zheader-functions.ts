import {
  ZRINIT_FLAG,
  ZSINIT_FLAG
} from './zheader-constants'
import ZmodemError from './zerror'

export function getZRINITFlagNum (fl: string): number {
  const flag = ZRINIT_FLAG[fl]
  if (flag === undefined) {
    throw new ZmodemError('Invalid ZRINIT flag: ' + fl)
  }
  return flag
}

export function getZSINITFlagNum (fl: string): number {
  const flag = ZSINIT_FLAG[fl]
  if (flag === undefined) {
    throw new ZmodemError('Invalid ZSINIT flag: ' + fl)
  }
  return flag
}
