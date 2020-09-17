require("dotenv").config();
const amqp = require("amqplib");
const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const ekarId = process.env.EKAR_ACCOUNT_ID;
const app = express();

const host = "https://hst-api.wialon.com/wialon/ajax.html?svc=token/login";
const updateFlagsUrl =
  "https://hst-api.wialon.com/wialon/ajax.html?svc=core/update_data_flags";
const avl_evtsUrl = "https://hst-api.wialon.com/avl_evts";
const token = process.env.WIALON_TOKEN;

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
    getEvent(sid);
  }, 1000);
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

let getEvent = async (sid) => {
  try {
    let evtsData = new FormData();

    evtsData.append("sid", sid);

    let evtSession = await axios
      .post(avl_evtsUrl, evtsData, { headers: evtsData.getHeaders() })
      .then((res) => {
        return res.data;
      });

    if (evtSession.events?.length > 0) {
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
      if (sendToQ.length > 0) {
        await sendMessage(sendToQ);
      }
    }
  } catch (err) {
    console.error(err);
  }
};

let q = "getUnits";
const sendMessage = async (msg) => {
  try {
    const conn = await amqp.connect("amqp://ekar:11223344@localhost");
    const channel = await conn.createChannel();
    const result = channel.assertQueue(q);
    if (msg.length > 0) {
      channel.sendToQueue(q, Buffer.from(JSON.stringify(msg)));
      console.log({
        message: msg,
        status: "Event Sent to Queue! " + Date(),
      });
    }
  } catch (err) {
    console.error(err);
  }
};
