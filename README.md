# zmodem-ts

It is a ts fork of [https://github.com/FGasper/zmodemjs](https://github.com/FGasper/zmodemjs).

Just rewrite with ts, nothing else.

## Installation

### Node.js

```bash
npm i -D zmodem-ts
```

## Usage example code

```js
import Sentry from 'zmodem-ts/dist/zsentry'
// or
// import Sentry from 'zmodem-ts/esm/zsentry.mjs'

// a xtermjs addon example
export class AddonZmodem {
  _disposables = []

  activate (terminal) {
    terminal.zmodemAttach = this.zmodemAttach
  }

  sendWebSocket = (octets) => {
    const { socket } = this
    if (socket && socket.readyState === WebSocket.OPEN) {
      return socket.send(new Uint8Array(octets))
    } else {
      console.error('WebSocket is not open')
    }
  }

  zmodemAttach = (ctx) => {
    this.socket = ctx.socket
    this.term = ctx.term
    this.ctx = ctx
    this.zsentry = new Sentry({
      to_terminal: (octets) => {
        if (ctx.onZmodem) {
          this.term.write(String.fromCharCode.apply(String, octets))
        }
      },
      sender: this.sendWebSocket,
      on_retract: ctx.onzmodemRetract,
      on_detect: ctx.onZmodemDetect
    })
    this.socket.binaryType = 'arraybuffer'
    this.socket.addEventListener('message', this.handleWSMessage)
  }

  handleWSMessage = (evt) => {
    if (typeof evt.data === 'string') {
      if (this.ctx.onZmodem) {
        this.term.write(evt.data)
      }
    } else {
      this.zsentry.consume(evt.data)
    }
  }

  dispose = () => {
    this.socket && this.socket.removeEventListener('message', this.handleWSMessage)
    this._disposables.forEach(d => d.dispose())
    this._disposables.length = 0
    this.term = null
    this.zsentry = null
    this.socket = null
  }
}

```

```js
import AttachAddon from './AddonZmodem'

class Term extends Component {
  componentDidMount() {
    this.zmodemAddon = new AddonZmodem()
    term.loadAddon(this.zmodemAddon)
  }

  onzmodemRetract = () => {
    log.debug('zmodemRetract')
  }

  writeBanner = (type) => {
    this.term.write(`\x1b[32mZMODEM::${type}::START\x1b[0m\r\n\r\n`)
  }

  onReceiveZmodemSession = async () => {
    const savePath = await this.openSaveFolderSelect()
    this.zsession.on('offer', this.onOfferReceive)
    this.zsession.start()
    this.term.write('\r\n\x1b[2A\r\n')
    if (!savePath) {
      return this.onZmodemEnd()
    }
    this.writeBanner('RECEIVE')
    this.zmodemSavePath = savePath
    return new Promise((resolve) => {
      this.zsession.on('session_end', resolve)
    })
      .then(this.onZmodemEnd)
      .catch(this.onZmodemCatch)
  }

  initZmodemDownload = async (name, size) => {
    if (!this.zmodemSavePath) {
      return
    }
    let pth = window.pre.resolve(
      this.zmodemSavePath, name
    )
    const exist = await fs.exists(pth).catch(() => false)
    if (exist) {
      pth = pth + '.' + generate()
    }
    const fd = await fs.open(pth, 'w').catch(this.onZmodemEnd)
    this.downloadFd = fd
    this.downloadPath = pth
    this.downloadCount = 0
    this.zmodemStartTime = Date.now()
    this.downloadSize = size
    this.updateZmodemProgress(
      0, pth, size, transferTypeMap.download
    )
    return fd
  }

  onOfferReceive = async (xfer) => {
    const {
      name,
      size
    } = xfer.get_details()
    if (!this.downloadFd) {
      await this.initZmodemDownload(name, size)
    }
    xfer.on('input', this.onZmodemDownload)
    this.xfer = xfer
    await xfer.accept()
      .then(this.finishZmodemTransfer)
      .catch(this.onZmodemEnd)
  }

  onZmodemDownload = async payload => {
    console.log('onZmodemDownload', payload)
    if (this.onCanceling || !this.downloadFd) {
      return
    }
    this.downloadCount += payload.length
    await fs.write(this.downloadFd, new Uint8Array(payload))
    this.updateZmodemProgress(
      this.downloadCount,
      this.downloadPath,
      this.downloadSize,
      transferTypeMap.download
    )
  }

  updateZmodemProgress = throttle((start, name, size, type) => {
    this.zmodemTransfer = {
      type,
      start,
      name,
      size
    }
    this.writeZmodemProgress()
  }, 500)

  finishZmodemTransfer = () => {
    this.zmodemTransfer = {
      ...this.zmodemTransfer,
      start: this.zmodemTransfer.size
    }
    this.writeZmodemProgress()
  }

  writeZmodemProgress = () => {
    if (this.onCanceling) {
      return
    }
    const {
      size, start, name
    } = this.zmodemTransfer
    const speed = size > 0 ? formatBytes(start * 1000 / 1024 / (Date.now() - this.zmodemStartTime)) : 0
    const percent = size > 0 ? Math.floor(start * 100 / size) : 100
    const str = `\x1b[32m${name}\x1b[0m::${percent}%,${start}/${size},${speed}/s`
    this.term.write('\r\n\x1b[2A' + str + '\n')
  }

  zmodemTransferFile = async (file, filesRemaining, sizeRemaining) => {
    const offer = {
      obj: file,
      name: file.name,
      size: file.size,
      files_remaining: filesRemaining,
      bytes_remaining: sizeRemaining
    }
    const xfer = await this.zsession.send_offer(offer)
    if (!xfer) {
      this.onZmodemEnd()
      return window.store.onError(new Error('Transfer cancelled, maybe file already exists'))
    }
    this.zmodemStartTime = Date.now()
    const fd = await fs.open(file.filePath, 'r')
    let start = 0
    const { size } = file
    let inited = false
    while (start < size || !inited) {
      const rest = size - start
      const len = rest > zmodemTransferPackSize ? zmodemTransferPackSize : rest
      const buffer = new Uint8Array(len)
      const newArr = await fs.read(fd, buffer, 0, len, null)
      const n = newArr.length
      await xfer.send(newArr)
      start = start + n
      inited = true
      this.updateZmodemProgress(start, file.name, size, transferTypeMap.upload)
      if (n < zmodemTransferPackSize || start >= file.size || this.onCanceling) {
        break
      }
    }
    await fs.close(fd)
    this.finishZmodemTransfer()
    await xfer.end()
  }

  openFileSelect = async () => {
    const properties = [
      'openFile',
      'multiSelections',
      'showHiddenFiles',
      'noResolveAliases',
      'treatPackageAsDirectory',
      'dontAddToRecent'
    ]
    const files = await window.api.openDialog({
      title: 'Choose some files to send',
      message: 'Choose some files to send',
      properties
    }).catch(() => false)
    if (!files || !files.length) {
      return this.onZmodemEnd()
    }
    const r = []
    for (const filePath of files) {
      const stat = await getLocalFileInfo(filePath)
      r.push({ ...stat, filePath })
    }
    return r
  }

  openSaveFolderSelect = async () => {
    const savePaths = await window.api.openDialog({
      title: 'Choose a folder to save file(s)',
      message: 'Choose a folder to save file(s)',
      properties: [
        'openDirectory',
        'showHiddenFiles',
        'createDirectory',
        'noResolveAliases',
        'treatPackageAsDirectory',
        'dontAddToRecent'
      ]
    }).catch(() => false)
    if (!savePaths || !savePaths.length) {
      return false
    }
    return savePaths[0]
  }

  beforeZmodemUpload = async (files) => {
    if (!files || !files.length) {
      return false
    }
    this.writeBanner('SEND')
    let filesRemaining = files.length
    let sizeRemaining = files.reduce((a, b) => a + b.size, 0)
    for (const f of files) {
      await this.zmodemTransferFile(f, filesRemaining, sizeRemaining)
      filesRemaining = filesRemaining - 1
      sizeRemaining = sizeRemaining - f.size
    }
    this.onZmodemEnd()
  }

  onSendZmodemSession = async () => {
    this.term.write('\r\n\x1b[2A\n')
    const files = await this.openFileSelect()
    this.beforeZmodemUpload(files)
  }

  onZmodemEnd = async () => {
    delete this.zmodemSavePath
    this.onCanceling = true
    if (this.downloadFd) {
      await fs.close(this.downloadFd)
    }
    if (this.xfer && this.xfer.end) {
      await this.xfer.end().catch(
        console.error
      )
    }
    delete this.xfer
    if (this.zsession && this.zsession.close) {
      await this.zsession.close().catch(
        console.error
      )
    }
    delete this.zsession
    this.term.focus()
    this.term.write('\r\n')
    this.onZmodem = false
    delete this.downloadFd
    delete this.downloadPath
    delete this.downloadCount
    delete this.downloadSize
    delete this.DownloadCache
  }

  onZmodemCatch = (e) => {
    this.onZmodemEnd()
  }

  onZmodemDetect = detection => {
    this.onCanceling = false
    this.term.blur()
    this.onZmodem = true
    const zsession = detection.confirm()
    this.zsession = zsession
    if (zsession.type === 'receive') {
      this.onReceiveZmodemSession()
    } else {
      this.onSendZmodemSession()
    }
  }

  render () {
    return null
  }
}

```

## License

MIT
