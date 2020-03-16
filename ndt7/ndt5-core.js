/* jshint esversion: 6, asi: true */
const ndt5core = (function () {
  "use strict"

  function locate(config) {
    if (config === undefined || config.userAcceptedDataPolicy !== true) {
      throw "fatal: user must accept data policy first"
    }
    if (config.mockedResult !== undefined && config.mockedResult !== "") {
      config.callback(config.mockedResult)
      return
    }
    if (config.url === undefined || config.url === "") {
      config.url = "https://locate.measurementlab.net/ndt_ssl"
    }
    fetch(config.url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json()
      })
      .then(function (doc) {
        config.callback("https://" + doc.fqdn + "/")
      })
  }

  function startWorker(config, url) {
    let worker = new Worker("ndt-wrapper-ww.js")
    worker.onmessage = function (ev) {
      let msg = ev.data;
      switch (msg.cmd) {
      case "onprogress":
        if (config.ontestmeasurement !== undefined) {
          config.ontestmeasurement({
            AppInfo: {
              ElapsedTime: 1000 * 1000 * ((msg.state === "interval_c2s") ?
                msg.results.c2sElapsed : msg.results.s2cElapsed),
              NumBytes: ((msg.state === "interval_c2s") ?
                msg.results.c2sTotal : msg.results.s2cTotal),
            },
            Origin: "client",
            Test: (msg.state === "interval_c2s") ? "upload" : "download"
          })
        }
        break
      case "onstatechange":
        if (msg.state === "finished_s2c" && config.ontestmeasurement !== undefined) {
          const prefix = "TCPInfo."
          let ti = {
            ElapsedTime: msg.results.s2cElapsed * 1e06, /* s => us */
          }
          for (let [key, value] of Object.entries(msg.results)) {
            if (key.startsWith(prefix)) {
              key = key.substr(prefix.length)
              ti[key] = Number(value)
            }
          }
          config.ontestmeasurement({
            Origin: "server",
            TCPInfo: ti,
            Test: "download"
          })
        }
        break
      case "onfinish":
        if (config.oncomplete !== undefined) {
          config.oncomplete()
        }
        break
      }
      console.log(msg)
    }
    let parsed = new URL(url)
    worker.postMessage({
      cmd: "start",
      hostname: parsed.hostname,
      port: 3001,
      protocol: "ws",
      path: "/ndt_protocol",
      update_interval: 250,
    })
  }

  // start starts the ndt5 test suite. The config object structure is:
  //
  //     {
  //       baseURL: "",
  //       oncomplete: function() {},
  //       onstarting: function() {},
  //       ontestcomplete: function (testSpec) {},
  //       ontestmeasurement: function (measurement) {},
  //       onteststarting: function (testSpec) {},
  //       userAcceptedDataPolicy: true
  //     }
  //
  // where
  //
  // - `baseURL` (`string`) is the optional http/https URL of the server (we
  //   will locate a suitable server if this is missing);
  //
  // - `oncomplete` (`function(testSpec)`) is the optional callback called
  //   when the whole test suite has finished;
  //
  // - `onstarting` is like `oncomplete` but called at startup;
  //
  // - `onserverurl` (`function(string)`) is called when we have located
  //   the server URL, or immediately if you provided a baseURL;
  //
  // - `ontestcomplete` is exactly like the `ontestcomplete` field passed
  //   to the `startWorker` function (see above);
  //
  // - `ontestmeasurement` is exactly like the `ontestmeasurement` field passed
  //   to the `startWorker` function (see above);
  //
  // - `onteststarting` is exactly like the `onteststarting` field passed
  //   to the `startWorker` function (see above);
  //
  // - `userAcceptedDataPolicy` MUST be present and set to true otherwise
  //   this function will immediately throw an exception.
  function start(config) {
    if (config.onstarting !== undefined) {
      config.onstarting()
    }
    locate({
      callback: function (url) {
        config.onserverurl(url)
        startWorker(config, url)
      },
      mockedResult: config.baseURL,
      userAcceptedDataPolicy: config.userAcceptedDataPolicy,
    })
  }

  return {
    start: start,
  }
})()
