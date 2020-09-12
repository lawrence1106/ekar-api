require("dotenv").config();
const ampq = require("amqplib").connect("amqp://localhost");
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const FormData = require("form-data");

const app = express();

app.use(bodyParser.json());

const host = "https://hst-api.wialon.com/wialon/ajax.html?svc=token/login";
const updateFlagsUrl =
  "https://hst-api.wialon.com/wialon/ajax.html?svc=core/update_data_flags";
const avl_evtsUrl = "https://hst-api.wialon.com/avl_evts";
const token = process.env.WIALON_TOKEN;
// main acc token expires after 30 days starting 09-09-2020
const mainAccToken =
  "3967d327829405b78f89d0587a6a5b5cA0C5C302CC1007C5EE5F00FB0362D169F875BDF4";
var msgQData = new Object();

app.get("/", (req, res) => {
  res.send(
    "<br><h4>Get Units: '/getUnits'</h4><p>Get Request</p><br><h4>Get Unit Interval: '/getUnitInterval'</h4><p>POST Request(For Demo)</p><p>Query Parameters:</p><p>device_id</p><p>start_time</p><p>end_time</p>"
  );
});

// mq
app.get("/avl_events", async (req, res) => {
  let q = "getUnits";

  let formData = new FormData();
  formData.append(
    "params",
    JSON.stringify({
      token: token,
    })
  );

  let sid = await axios
    .post(host, formData, { headers: formData.getHeaders() })
    .then((res) => {
      return res.data.eid;
    });

  let flagsData = new FormData();

  flagsData.append(
    "params",
    JSON.stringify({
      spec: [
        {
          type: "type",
          data: "avl_unit",
          flags: 5255425,
          mode: 0,
        },
      ],
    })
  );

  flagsData.append("sid", sid);

  let unitData = await axios
    .post(updateFlagsUrl, flagsData, {
      headers: flagsData.getHeaders(),
    })
    .then((res) => {
      let data = res.data;
      data.map((details) => {
        let unit = {};

        unit.device_id = details.d.uid;
        unit.gps_latitude = details.d.pos ? details.d.pos.x : "";
        unit.gps_longitude = details.d.pos ? details.d.pos.y : "";
        unit.gps_signal = details.d.pos ? details.d.pos.sc : "";
        unit.mileage = details.d.cnm ? details.d.cnm : "";
        if (details.d.prms) {
          if (details.d.prms.can_fls) {
            unit.fuel_level = details.d.prms.can_fls.v;
          } else {
            unit.fuel_level = "No Can fls";
          }
        } else {
          unit.fuel_level = "No Data";
        }
        unit.direction = details.d.pos ? details.d.pos.c : "";
        unit.wheelbased_speed = details.prms ? details.prms.wheel_speed.v : "";
        unit.recorded_at = details.d.pos ? details.d.pos.t : "";

        msgQData[details.i] = unit;
      });
      console.log(msgQData);
    });

  setInterval(() => {
    request(q, sid);
  }, 5000);

  res.json(msgQData);
});

// api done
app.get("/getUnits", async (req, res) => {
  let q = "getUnits";

  let formData = new FormData();
  formData.append("params", JSON.stringify({ token: mainAccToken }));

  let sid = await axios
    .post(host, formData, { headers: formData.getHeaders() })
    .then((response) => {
      return response.data.eid;
    });

  let searchItems = new FormData();

  searchItems.append("sid", sid);
  searchItems.append(
    "params",
    JSON.stringify({
      spec: {
        itemsType: "avl_unit",
        propName: "sys_name",
        propValueMask: "*",
        sortType: "sys_name",
        propType: "property",
      },
      force: 1,
      // flags used 4194304 256 1 8192 1048576 4096
      flags: 5255425,
      from: 0,
      to: 0,
    })
  );

  let data = await axios
    .post(
      "https://hst-api.wialon.com/wialon/ajax.html?svc=core/search_items",
      searchItems,
      { headers: searchItems.getHeaders() }
    )
    .then((itemResponse) => {
      let allUnits = itemResponse.data.items;
      let organizedData = [];
      allUnits.map((unit) => {
        let unitDetails = {};
        unitDetails.device_id = unit.uid;

        unitDetails.gps_latitude = unit.pos
          ? unit.pos["x"]
          : (unitDetails.gps_latitude = "N/A");
        unitDetails.gps_longitude = unit.pos
          ? unit.pos["y"]
          : (unitDetails.gps_longitude = "N/A");
        unitDetails.gps_signal = unit.pos
          ? unit.pos["sc"]
          : (unitDetails.gps_signal = "N/A");
        unitDetails.mileage = unit.cnm;
        let sensorValue;
        if (unit.prms) {
          if (unit.prms.can_fls) {
            if (unit.prms.can_fls.v) {
              sensorValue = unit.prms.can_fls.v;
            }
          }
        }
        if (unit.sens) {
          if (unit.sens["13"]) {
            if (unit.sens["13"].tbl) {
              if (unit.sens["13"].tbl[0]) {
                if (unit.sens["13"].tbl[0]["a"]) {
                  let multiplier = unit.sens["13"].tbl[0]["a"];
                  unitDetails.fuel_level = sensorValue * multiplier;
                } else {
                  unitDetails.fuel_level = "Device not Supported";
                }
              }
            }
          }
        }
        unitDetails.direction = unit.pos
          ? unit.pos["c"]
          : (unitDetails.direction = "N/A");
        unitDetails.wheelbased_speed = unit.pos
          ? unit.pos["s"]
          : (unitDetails.wheelbased_speed = "N/A");
        unitDetails.recorded_at = unit.pos
          ? unit.pos["t"]
          : (unitDetails.recorded_at = "N/A");
        organizedData.push(unitDetails);
      });
      return allUnits;
    });

  res.json(data);
});

// api done
app.post("/getUnitInterval", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let device_id = req.body.device_id;
  let start_time = req.body.start_time;
  let end_time = req.body.end_time;

  let formData = new FormData();
  formData.append("params", JSON.stringify({ token: token }));

  axios
    .post(host, formData, { headers: formData.getHeaders() })
    .then((response) => {
      let searchItem = new FormData();
      searchItem.append("sid", response.data.eid);
      searchItem.append(
        "params",
        JSON.stringify({
          spec: {
            itemsType: "avl_unit",
            propName: "sys_name",
            propValueMask: "*",
            sortType: "sys_name",
            propType: "property",
          },
          force: 1,
          // flags used 4194304 256 1 8192 1048576 4096
          flags: 5255425,
          from: 0,
          to: 0,
        })
      );
      axios
        .post(
          "https://hst-api.wialon.com/wialon/ajax.html?svc=core/search_items",
          searchItem,
          { headers: searchItem.getHeaders() }
        )
        .then((itemResponse) => {
          let allUnits = itemResponse.data.items;
          let unitId = [];
          allUnits.map((unit) => {
            if (unit.uid == device_id) {
              let multiplier;
              let sensors = Object.keys(unit.sens);
              sensors.map((index) => {
                if (unit.sens[index].p == "can_fls") {
                  multiplier = unit.sens[index].tbl[0].a;
                }
              });

              unitId.push({ id: unit.id, calculation: multiplier });
            }
          });
          if (unitId.length === 1) {
            let getItem = new FormData();
            getItem.append("sid", response.data.eid);
            getItem.append(
              "params",
              JSON.stringify({
                itemId: unitId[0].id,
                timeFrom: start_time,
                timeTo: end_time,
                flags: 0x0003,
                flagsMask: 0xff03,
                loadCount: 0xffffffff,
              })
            );

            axios
              .post(
                "https://hst-api.wialon.com/wialon/ajax.html?svc=messages/load_interval",
                getItem,
                { headers: getItem.getHeaders() }
              )
              .then((msgResponse) => {
                let organizedMsgs = [];
                let unitMessages = msgResponse.data.messages;
                unitMessages.map((msg) => {
                  let setMsg = {};
                  msg.pos["x"]
                    ? (setMsg.gps_latitude = msg.pos["x"])
                    : (setMsg.gps_latitude = "N/A");
                  msg.pos["y"]
                    ? (setMsg.gps_longitude = msg.pos["y"])
                    : (setMsg.gps_longitude = "N/A");
                  msg.pos["sc"]
                    ? (setMsg.gps_signal = msg.pos["sc"])
                    : (setMsg.gps_signal = "N/A");
                  msg.p["odo"]
                    ? (setMsg.mileage = msg.p["odo"])
                    : (setMsg.mileage = "N/A");
                  msg.p["can_fls"]
                    ? (setMsg.fuel_level =
                        msg.p.can_fls * unitId[0].calculation)
                    : (setMsg.fuel_level = "N/A");
                  msg.pos["c"]
                    ? (setMsg.direction = msg.pos["c"])
                    : (setMsg.direction = "N/A");
                  msg.p["wheel_speed"]
                    ? (setMsg.wheelbased_speed = msg.p["wheel_speed"])
                    : (setMsg.wheelbased_speed = "N/A");
                  msg["t"]
                    ? (setMsg.recorded_at = msg["t"])
                    : (setMsg.recorded_at = "N/A");
                  organizedMsgs.push(setMsg);
                });
                res.json(organizedMsgs);
              });
          }
        });
    });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`server now running at port ${PORT}`);
});

// client requirements
// Post Endpoint: /events parameters:{on off lock unlock}
// Post mq: endpoint/getPosition parameter:{ id/imei } response:{format nila}

// EKar requirements
// Post Endpoint: /events parameters:{on off lock unlock}
// Post endpoint: /getUnits response:{format nila}
// Post endpoint: /getUnitInterval parameter:{ id/imei } response:{format nila}
// Post mq: endpoint/getPosition parameter:{ id/imei } response:{format nila}
// Post mq: endpoint/getPositionAllVehicles parameter:{ avl_units } response:{format nila}

// ats
// avl events use =>
let request = async (q, sid) => {
  let evtsData = new FormData();

  evtsData.append("sid", sid);

  let evtSession = await axios
    .post(avl_evtsUrl, evtsData, { headers: evtsData.getHeaders() })
    .then((res) => {
      return res.data;
    });
  if (typeof evtSession.events != "undefined") {
    if (evtSession.events.length > 0) {
      // let event = { unitId: event };
      let event = evtSession.events;
      // event.map((e) => {
      //   let id = e.i;
      //   let data = e.d;
      //   let index = msgQData.find((find) => {
      //     find.
      //   })
      // });
      console.log(event);
      // console.log(event);
      // event.map((events) => {
      //   console.log({
      //     timestamp: evtSession.tm,
      //     unitID: events.i,
      //     data: JSON.stringify(events.d, " ", 1),
      //   });
      // });

      // ampq
      //   .then((conn) => {
      //     return conn.createChannel();
      //   })
      //   .then(async (ch) => {
      //     return ch.assertQueue(q).then((ok) => {
      //       return ch.sendToQueue(q, Buffer.from(JSON.stringify(event)));
      //     });
      //   })
      //   .catch(console.warn);
    }
  }
};
