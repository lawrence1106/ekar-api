require("dotenv").config();
const amqp = require("amqplib").connect("amqp://localhost");
const express = require("express");
const axios = require("axios");
const FormData = require("form-data");

const app = express();

const host = "https://hst-api.wialon.com/wialon/ajax.html?svc=token/login";
const updateFlagsUrl =
  "https://hst-api.wialon.com/wialon/ajax.html?svc=core/update_data_flags";
const avl_evtsUrl = "https://hst-api.wialon.com/avl_evts";
const token = process.env.WIALON_TOKEN;

const PORT = process.env.PORT || 8081;
let msgQData = new Object();
app.listen(PORT, async () => {
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

  setInterval(() => {
    getEvent(q, sid);
  }, 5000);
  console.log({ data: msgQData, status: "Flags Set!" });
});

// functions
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
        let event = evtSession.events;
        event.map((unitData) => {
          let eventUnitId = unitData.i;
          Object.keys(msgQData).forEach((uniId) => {
            if (uniId == eventUnitId) {
              if (unitData.d.odometer) {
                if (unitData.d.odometer.v) {
                  msgQData[eventUnitId].mileage = unitData.d.odometer.v;
                }
              }
              if (unitData.d.p) {
                if (unitData.d.p.fuel_lvl2) {
                  msgQData[eventUnitId].fuel_level = unitData.d.p.fuel_lvl2;
                }
              }
              if (unitData.d.p) {
                if (unitData.d.p.wheel_speed) {
                  msgQData[eventUnitId].wheelbased_speed =
                    unitData.d.p.wheel_speed;
                }
              }
              if (unitData.d.pos) {
                if (unitData.d.pos.x) {
                  msgQData[eventUnitId].gps_latitude = unitData.d.pos.x;
                }
                if (unitData.d.pos.y) {
                  msgQData[eventUnitId].gps_longitude = unitData.d.pos.y;
                }
                if (unitData.d.pos.sc) {
                  msgQData[eventUnitId].gps_signal = unitData.d.pos.sc;
                }
                if (unitData.d.pos.c) {
                  msgQData[eventUnitId].direction = unitData.d.pos.c;
                }
                msgQData[eventUnitId].recorded_at = evtSession.tm;
              }
            }
          });
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
                return ch.sendToQueue(q, Buffer.from(JSON.stringify(sendToQ)));
              });
            } catch (err) {
              console.error(err);
            }
          })
          .catch(console.warn);
        console.log({
          message: sendToQ,
          status: "Incoming Event Sent to Queue! " + Date(),
        });
      }
    }
  } catch (err) {
    console.error(err);
  }
};
