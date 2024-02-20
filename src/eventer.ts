import { Obj } from './types'

class _Eventer {
  _on_evt: Obj = {}
  _evt_once_index: Obj = {}

  // Private method to initialize event queue and once index
  _Add_event (evtName: string): void {
    this._on_evt[evtName] = []
    this._evt_once_index[evtName] = []
  }

  // Private method to get the event queue, throwing if it doesn't exist
  _get_evt_queue (evtName: string): any[] {
    if (typeof this._on_evt[evtName] === 'undefined') {
      throw new Error(`Bad event: ${evtName}`)
    }
    return this._on_evt[evtName]
  }

  /**
   * Register a callback for a given event.
   *
   * @param evtName The name of the event.
   * @param todo The function to execute when the event happens.
   */
  on (evtName: string, todo: Function): _Eventer {
    const queue = this._get_evt_queue(evtName)
    queue.push(todo)
    return this
  }

  /**
   * Unregister a callback for a given event.
   *
   * @param evtName The name of the event.
   * @param todo The function to unregister, if provided.
   */
  off (evtName: string, todo?: Function): _Eventer {
    const queue = this._get_evt_queue(evtName)
    if (todo !== undefined) {
      const at = queue.indexOf(todo)
      if (at === -1) {
        throw new Error(`"${todo.name}" is not in the "${evtName}" queue.`)
      }
      queue.splice(at, 1)
    } else {
      queue.pop()
    }
    return this
  }

  // Private method to trigger the event and call all registered callbacks
  _Happen (evtName: string, ...args: any[]): number {
    const queue = this._get_evt_queue(evtName) // Validate here if needed
    queue.forEach((cb: Function) => {
      cb.apply(this, args)
    })
    return queue.length
  }
}

export default _Eventer
