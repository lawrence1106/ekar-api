require("dotenv").config();
const amqp = require("amqplib").connect("amqp://localhost");
// const amqp = require("amqplib").connect(
//   "amqps://tghbtmwi:UYyNMfLqqaGzxsuTI-8ZfPhA-Q5lPqry@grouse.rmq.cloudamqp.com/tghbtmwi"
// );
const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const ekarId = 21704484;
const app = express();

const host = "https://hst-api.wialon.com/wialon/ajax.html?svc=token/login";
const updateFlagsUrl =
  "https://hst-api.wialon.com/wialon/ajax.html?svc=core/update_data_flags";
const avl_evtsUrl = "https://hst-api.wialon.com/avl_evts";
const token = process.env.WIALON_TOKEN;
const mainAccToken =
  "3967d327829405b78f89d0587a6a5b5cA0C5C302CC1007C5EE5F00FB0362D169F875BDF4";

const PORT = process.env.PORT || 8080;
let msgQData = new Object();
app.listen(PORT, () => {
  createRefreshsession();

  setInterval(() => {
    createRefreshsession();
  }, 3600000);
});

// functions
let createRefreshsession = async () => {
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

  await setUnitFlags(sid);
  await setUserFlags(sid);

  setInterval(() => {
    getEvent(q, sid);
  }, 1500);
};

let setUserFlags = async (sid) => {
  let flagsData = new FormData();

  flagsData.append(
    "params",
    JSON.stringify({
      spec: [
        {
          type: "id",
          data: ekarId,
          flags: 33,
          mode: 0,
        },
      ],
    })
  );

  flagsData.append("sid", sid);

  let userData = await axios
    .post(updateFlagsUrl, flagsData, {
      headers: flagsData.getHeaders(),
    })
    .then((res) => {
      return res.data;
    });

  console.log("Updated User Flags");
};

let setUnitFlags = async (sid) => {
  let flagsData = new FormData();

  flagsData.append(
    "params",
    JSON.stringify({
      spec: [
        {
          type: "type",
          data: "avl_unit",
          flags: 5387521,
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
        unit.gps_latitude = details.d.pos?.x || null;
        unit.gps_longitude = details.d.pos?.y || null;
        unit.gps_signal = details.d.pos?.sc || null;
        unit.mileage = details.d?.cnm || null;
        unit.fuel_level = details.d.prms?.fuel_lvl2?.v || null;
        unit.direction = details.d.pos?.c || null;
        unit.wheelbased_speed = details.d.prms?.wheel_speed?.v || null;
        unit.recorded_at = details.d.pos?.t || null;
        msgQData[details.i] = unit;
      });
    });

  console.log("Updated Unit Flags");
};

let resetUnitFlags = async (sid) => {
  msgQData = {};
  let flagsData = new FormData();

  flagsData.append(
    "params",
    JSON.stringify({
      spec: [
        {
          type: "type",
          data: "avl_unit",
          flags: 5387521,
          mode: 2,
        },
      ],
    })
  );

  flagsData.append("sid", sid);

  let unitData = await axios.post(updateFlagsUrl, flagsData, {
    headers: flagsData.getHeaders(),
  });

  console.log("Reset Unit Flags");
};

let getEvent = async (q, sid) => {
  try {
    let evtsData = new FormData();

    evtsData.append("sid", sid);

    let evtSession = await axios
      .post(avl_evtsUrl, evtsData, { headers: evtsData.getHeaders() })
      .then((res) => {
        return res.data;
      });
    if (typeof evtSession.events != "undefined") {
      if (evtSession.events.length > 0) {
        let event = evtSession.events; // Array
        event.map(async (evtData) => {
          let eventID = evtData.i;
          if (eventID == ekarId) {
            if (evtData.d?.p?.action == "update_access") {
              await resetUnitFlags(sid);
              msgQData = {};
              setUnitFlags(sid);
            }
          } else {
            if (evtData.d.odometer) {
              if (evtData.d.odometer.v) {
                msgQData[eventID].mileage = evtData.d.odometer.v;
              }
            }
            if (evtData.d.p) {
              if (evtData.d.p.fuel_lvl2) {
                msgQData[eventID].fuel_level = evtData.d.p.fuel_lvl2;
              }
            }
            if (evtData.d.p) {
              if (evtData.d.p.wheel_speed) {
                msgQData[eventID].wheelbased_speed = evtData.d.p.wheel_speed;
              }
            }
            if (evtData.d.pos) {
              if (evtData.d.pos.x) {
                msgQData[eventID].gps_latitude = evtData.d.pos.x;
              }
              if (evtData.d.pos.y) {
                msgQData[eventID].gps_longitude = evtData.d.pos.y;
              }
              if (evtData.d.pos.sc) {
                msgQData[eventID].gps_signal = evtData.d.pos.sc;
              }
              if (evtData.d.pos.c) {
                msgQData[eventID].direction = evtData.d.pos.c;
              }
              msgQData[eventID].recorded_at = evtSession.tm;
            }
          }
        });
        let sendToQ = [];
        let formattedData = Object.values(msgQData);
        formattedData.map((unitDetails) => {
          sendToQ.push(unitDetails);
        });
        amqp
          .then((conn) => {
            return conn.createChannel();
          })
          .then(async (ch) => {
            try {
              return ch.assertQueue(q).then((ok) => {
                if (sendToQ.length > 0) {
                  return ch.sendToQueue(
                    q,
                    Buffer.from(JSON.stringify(sendToQ))
                  );
                }
              });
            } catch (err) {
              console.error(err);
            }
          })
          .catch(console.warn);
        if (sendToQ.length > 0) {
          console.log({
            message: sendToQ,
            status: "Event Sent to Queue! " + Date(),
          });
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
};
