
// **, ZDLE, 'B0'
// ZRQINIT’s next byte will be '0' ZRINIT’s will be '1'.
// const COMMON_ZM_HEX_START: number[] = [42, 42, 24, 66, 48]

// const SENTRY_CONSTRUCTOR_REQUIRED_ARGS: string[] = [
//   'to_terminal',
//   'on_detect',
//   'on_retract',
//   'sender'
// ]

/**
 * An instance of this object is passed to the Sentry’s on_detect
 * callback each time the Sentry object sees what looks like the
 * start of a ZMODEM session.
 *
 * Note that it is possible for a detection to be “retracted”
 * if the Sentry consumes bytes afterward that are not ZMODEM.
 * When this happens, the Sentry’s `retract` event will fire,
 * after which the Detection object is no longer usable.
 */
class Detection {
  sess: any
  sentry: any
  _denier: Function
  _is_valid: Function
  _session_type: string

  /**
   * Not called directly.
   */
  constructor (
    sessionType: string,
    sess: any,
    sentry: any,
    denier: Function,
    checker: Function
  ) {
    // confirm() - user confirms that ZMODEM is desired
    this.sess = sess
    this.sentry = sentry
    // deny() - user declines ZMODEM send abort sequence
    //
    // TODO: It might be ideal to forgo the session “peaceably”,
    // i.e., such that the peer doesn’t end in error. That’s
    // possible if we’re the sender, we accept the session,
    // then we just send a close(), but it doesn’t seem to be
    // possible for a receiver. Thus, let’s just leave it so
    // it’s at least consistent (and simpler, too).
    this._denier = denier
    this._is_valid = checker

    this._session_type = sessionType
  }

  _confirmer (): any {
    if (!this.is_valid()) {
      throw new Error('Stale ZMODEM session!')
    }

    const { sess, sentry } = this

    sess.on('garbage', sentry._to_terminal)

    sess.on('session_end', sentry._after_session_end)

    sess.set_sender(sentry._sender)

    sess._parsed_session = null

    sentry._zsession = sess
    return sess
  }

  /**
   * Confirm that the detected ZMODEM sequence indicates the
   * start of a ZMODEM session.
   *
   * @return {Session} The ZMODEM Session object (i.e., either a
   *  Send or Receive instance).
   */
  confirm = (...args: any[]): any => {
    return this._confirmer.apply(this, args as [])
  }

  /**
   * Tell the Sentry that the detected bytes sequence is
   * **NOT** intended to be the start of a ZMODEM session.
   */
  deny = (...args: any[]): any => {
    return this._denier(...args)
  }

  /**
   * Tells whether the Detection is still valid i.e., whether
   * the Sentry has `consume()`d bytes that invalidate the
   * Detection.
   *
   * @returns {boolean} Whether the Detection is valid.
   */
  is_valid = (...args: any[]): boolean => {
    return this._is_valid(...args)
  }

  /**
   * Gives the session’s role.
   *
   * @returns {string} One of:
   * - `receive`
   * - `send`
   */
  get_session_role = (): string => {
    return this._session_type
  }
}

export default Detection
