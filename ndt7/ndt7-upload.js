/* jshint esversion: 6, asi: true, worker: true */
// WebWorker that runs the ndt7 upload test
onmessage = function (ev) {
  "use strict"
  let url = new URL(ev.data.baseURL)
  url.protocol = (url.protocol === "https:") ? "wss:" : "ws:"
  const wsproto = "net.measurementlab.ndt.v7"
  url.pathname = "/ndt/v7/upload"
  const sock = new WebSocket(url.toString(), wsproto)
  let closed = false
  sock.onclose = function () {
    closed = true
    postMessage(null)
  }
  sock.onerror = function (error) {
    console.log(error)
  }
  function uploader(socket, data, start, previous, total) {
    if (closed) {
      return // socket.send() with too much buffering causes socket.close()
    }
    let now = new Date().getTime()
    const duration = 10000  // millisecond
    if (now - start > duration) {
      sock.close()
      return
    }
    /*
    const maxMessageSize = 1<<20
    if (data.length < maxMessageSize && data.length < (total - sock.bufferedAmount)/16) {
      data = new Uint8Array(data.length * 2) // TODO(bassosimone): fill this message
    }
    */
    const underbuffered = 8192
    if (sock.bufferedAmount < underbuffered) {
      sock.send(data)
      total += data.length
    }
    const every = 250  // millisecond
    if (now - previous > every) {
      postMessage({
        "AppInfo": {
          "ElapsedTime": (now - start) * 1000,  // us
          "NumBytes": (total - sock.bufferedAmount),
        },
        "Origin": "client",
        "Test": "upload",
      })
      previous = now
    }
    setTimeout(
      function() { uploader(sock, data, start, previous, total) },
      0)
  }
  sock.onopen = function () {
    const initialMessageSize = 1<<8 /* (1<<13) */
    const data = new Uint8Array(initialMessageSize) // TODO(bassosimone): fill this message
    sock.binarytype = "arraybuffer"
    const start = new Date().getTime()
    uploader(sock, data, start, start, 0)
  }
}
