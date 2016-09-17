'use strict';

const os = require("os");
const got = require("got");
const Promise = require("bluebird");
const fs      = Promise.promisifyAll(require("fs"));
const child_process = Promise.promisifyAll(require("child_process"));


const logPush = options => {
  return got.post(`${options.host || "127.0.0.1"}:${options.port || 9880}/${options.tag || ""}`, {
    body: JSON.stringify(options.data),
    json: true
  });
};



function cpuUsage(options){
  options = options || {};
  const keys = ["user", "nice", "sys", "idle"];
  let result = {
    cpu: {},
    cpus: []
  };

  return new Promise((resolve, reject) => {
    const primary = os.cpus();

    setTimeout(() => {
      const secondary = os.cpus();

      let all = keys.reduce((o, key) => {
        o[key] = 0;
        return o;
      }, {});

      secondary.forEach((cpu, i) => {

        let diff = keys.reduce((res, key) => {
          res[key] = secondary[i].times[key] - primary[i].times[key];
          return res;
        }, {});

        let total = keys.reduce((n, key) => {
          return n += diff[key];
        }, 0);

        keys.forEach(key => {
          all[key] += diff[key];
        });

        // set result
        result.cpus.push({});
        keys.forEach(key => {
          result.cpus[i][key] = diff[key] / total;
        });

      });

      let allTotal = keys.reduce((n, key) => {
        return n += all[key];
      }, 0);

      keys.forEach(key => {
        result.cpu[key] = all[key] / allTotal;
      });



      resolve(result);

    }, options.delay || 1000);

  });
}



function meminfo(options){
  return fs.readFileAsync("/proc/meminfo", "utf8")
    .then(res => {
      return res.split("\n").slice(0, -1).reduce((result, line) => {
        let d = line.split(":");
        let key = d[0];
        let val = d[1].trim().split(" ")[0];
        result[key] = parseInt(val, 10);

        return result;
      }, {});
    });
}




function df(options){
  options = options || {};
  let args = ["-P"];

  if(options.target){
    args.push(options.target);
  }

  return new Promise((resolve, reject) => {
    let data = "";
    const df = child_process.spawn("df", args);

    df.stdout.on("data", d => data += d)
    df.stderr.on("data", reject);
    df.on("close", () => {
      resolve(data);
    });

  })
    .then(res => {
      return res.split("\n").slice(1, -1)
        .map(line => {
          let data = line.split(" ").filter(a => a);

          return {
            filesystem: data[0],
            blocks:     parseInt(data[1], 10),
            used:       parseInt(data[2], 10),
            available:  parseInt(data[3], 10),
            parcent:    data[4],
            mount:      data[5]
          };
        });

    });

}





module.exports = options => {
  options = options || {};

  const prefix = options.prefix || "";
  const name = options.name || os.hostname();
  const suffix = options.suffix || "";

  const tag = `${prefix}${name}${suffix}`;

  return Promise.all([

    cpuUsage()
      .then(res => {
        //const fix = n => parseFloat(n.toFixed(3))
        const fix = n => parseInt(n * 100)

        Object.keys(res.cpu).forEach(key => {
          res.cpu[key] = fix(res.cpu[key]);
        });

        res.cpus.forEach(cpu => {
          Object.keys(cpu).forEach(key => {
            cpu[key] = fix(cpu[key]);
          });
        });

        return res;
      }),

    meminfo(),

    df({
      target: options.dfTarget
    })

  ])
  .then(results => {
    return Object.assign({
      meminfo: results[1],
      df: results[2],
      loadavg: os.loadavg(),
      uptime: os.uptime(),
      hostname: os.hostname()

    }, results[0]);
  })
  .then(res => {
    if(options.debug){
      return res;
    }

    return logPush({
      data: res,
      host: options.host,
      port: options.port,
      tag: tag
    });
  });
};

