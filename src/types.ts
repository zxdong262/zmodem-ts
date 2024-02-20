export interface Obj {
  [key: string]: any
}

export interface FlagType {
  [key: string]: number
}

export interface N {
  [key: number]: number
}

export interface Opts {
  offset?: number
  on_input?: string
}

export interface ZDLEConfig {
  escape_ctrl_chars: boolean
  turbo_escape: boolean
}

export interface SentryOpts {
  to_terminal: Function
  on_detect: Function
  on_retract: Function
  sender: Function
}

export interface ValidateParams {
  name: string
  serial?: any
  size?: number
  mode?: number
  files_remaining?: number
  bytes_remaining?: number
  mtime?: number | Date
}
